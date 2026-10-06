/* Tabela de totais por ano e as tabelas de média/mediana (por município e por candidato). */

import { YEARS, OFFICE_ORDER, nameOf } from './config.js';
import { store } from './store.js';
import { totalsTableEl, averagesTableEl, candidateAveragesTableEl } from './dom.js';
import { votesOf, candidatesOf } from './offices.js';
import { fetchData } from './elections-repository.js';

// Identifica um candidato de forma única no ano. Os nomes vêm com espaços
// sobrando ("Katiany  "), então normaliza. Na visão Brasil, o mesmo nome
// pode ser de pessoas diferentes em UFs diferentes, por isso a UF entra na
// chave; a exceção é PRESIDENTE, que é o mesmo candidato no país todo.
function candidateKey(office, name, municipalityCode) {
  const state = office === 'PRESIDENTE' ? '' : municipalityCode.slice(0, 2);
  return office + '|' + state + '|' + name.trim().replace(/\s+/g, ' ');
}

export async function buildTotalsTable() {
  // Busca todos os anos do estado ativo (usa cache) e soma por cargo.
  const totalsByYear = {};          // { 2022: { GOVERNADOR: 1745, ... }, ... }
  const candidatesByYear = {};      // { 2022: Map{candidato -> {office, votes}}, ... }
  const valuesByYear = {};          // { 2022: { GOVERNADOR: [votos por município], ... } }
  const candidateValuesByYear = {}; // { 2022: { GOVERNADOR: [votos por candidato], ... } }
  const seenOffices = new Set();

  for (const year of YEARS) {
    const data = await fetchData(store.activeState, year);
    if (!data) { totalsByYear[year] = null; continue; }
    const totals = {};
    const values = { [TOTAL]: [] };
    const candidateMap = new Map();   // candidatos únicos do ano (todos os cargos)
    Object.entries(data).forEach(([code, municipality]) => {
      let municipalityTotal = 0;
      Object.keys(municipality).forEach(office => {
        if (office === 'nome') return;
        seenOffices.add(office);
        const votes = votesOf(municipality, office);
        totals[office] = (totals[office] || 0) + votes;
        (values[office] = values[office] || []).push(votes);
        municipalityTotal += votes;
        // soma os votos de cada candidato, juntando todos os municípios
        const candidates = candidatesOf(municipality, office);
        if (candidates) Object.entries(candidates).forEach(([name, count]) => {
          const key = candidateKey(office, name, code);
          const c = candidateMap.get(key) || { office, votes: 0 };
          c.votes += count;
          candidateMap.set(key, c);
        });
      });
      values[TOTAL].push(municipalityTotal);
    });
    const candidateValues = { [TOTAL]: [] };
    candidateMap.forEach(({ office, votes }) => {
      (candidateValues[office] = candidateValues[office] || []).push(votes);
      candidateValues[TOTAL].push(votes);
    });
    totalsByYear[year] = totals;
    candidatesByYear[year] = candidateMap;
    valuesByYear[year] = values;
    candidateValuesByYear[year] = candidateValues;
  }

  const officeList = OFFICE_ORDER.filter(o => seenOffices.has(o))
    .concat([...seenOffices].filter(o => !OFFICE_ORDER.includes(o)));

  if (!officeList.length) {
    totalsTableEl.innerHTML = '<tbody><tr><td style="color:var(--text-muted)">Nenhum dado disponível para ' + nameOf(store.activeState) + '.</td></tr></tbody>';
    averagesTableEl.innerHTML = '';
    candidateAveragesTableEl.innerHTML = '';
    return;
  }

  // Cabeçalho: Cargo | 2014 | 2016 | ... (só anos com dados)
  const yearsWithData = YEARS.filter(y => totalsByYear[y]).sort((a, b) => a - b);
  let thead = '<thead><tr><th>Cargo</th>';
  yearsWithData.forEach(y => thead += '<th data-year="' + y + '">' + y + '</th>');
  thead += '</tr></thead>';

  let tbody = '<tbody>';
  officeList.forEach(office => {
    tbody += '<tr><td>' + office.toLowerCase() + '</td>';
    yearsWithData.forEach(y => {
      const v = totalsByYear[y][office];
      tbody += '<td data-year="' + y + '" data-office="' + office + '">' +
               (v ? v.toLocaleString('pt-BR') : '<span class="empty">—</span>') + '</td>';
    });
    tbody += '</tr>';
  });

  // Linha: nº de candidaturas distintas do PSTU por ano
  tbody += '<tr class="candidates-row"><td>candidatos</td>';
  yearsWithData.forEach(y => {
    tbody += '<td>' + (candidatesByYear[y] ? candidatesByYear[y].size.toLocaleString('pt-BR') : '—') + '</td>';
  });
  tbody += '</tr>';

  // Linha de total geral por ano (soma de todos os cargos, igual ao "Todos" marcado no mapa)
  tbody += '<tr class="total-row"><td>total</td>';
  yearsWithData.forEach(y => {
    const total = Object.values(totalsByYear[y]).reduce((s, v) => s + v, 0);
    tbody += '<td>' + total.toLocaleString('pt-BR') + '</td>';
  });
  tbody += '</tr></tbody>';

  totalsTableEl.innerHTML = thead + tbody;
  averagesTableEl.innerHTML = buildAveragesTableHtml(officeList, yearsWithData, valuesByYear);
  candidateAveragesTableEl.innerHTML = buildAveragesTableHtml(officeList, yearsWithData, candidateValuesByYear);
  highlightActiveColumn();
}

// ---------- Tabelas de média e mediana ----------
// Mesmas linhas da tabela de totais; cada ano tem duas colunas.
// - por município: base são os municípios presentes no arquivo do pleito
//   (inclusive os com 0 voto);
// - por candidato: base é o total de votos de cada candidato no recorte
//   (UF ou Brasil). Na linha "total", entram todos os candidatos do ano.
const TOTAL = '__total__';

function average(values) {
  return values.reduce((s, v) => s + v, 0) / values.length;
}
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
const formatDecimal = v => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

function buildAveragesTableHtml(officeList, yearsWithData, valuesByYear) {
  let thead = '<thead><tr><th rowspan="2">Cargo</th>';
  yearsWithData.forEach(y => thead += '<th colspan="2" class="year-group" data-year="' + y + '">' + y + '</th>');
  thead += '</tr><tr>';
  yearsWithData.forEach(() => thead += '<th class="sub">média</th><th class="sub">mediana</th>');
  thead += '</tr></thead>';

  const cellsFor = (year, key) => {
    const values = valuesByYear[year][key];
    const attribute = key === TOTAL ? '' : ' data-office="' + key + '"';
    if (!values || !values.length) return ('<td' + attribute + '><span class="empty">—</span></td>').repeat(2);
    return '<td' + attribute + '>' + formatDecimal(average(values)) + '</td>' +
           '<td' + attribute + '>' + formatDecimal(median(values)) + '</td>';
  };

  let tbody = '<tbody>';
  officeList.forEach(office => {
    tbody += '<tr><td>' + office.toLowerCase() + '</td>';
    yearsWithData.forEach(y => tbody += cellsFor(y, office));
    tbody += '</tr>';
  });
  tbody += '<tr class="total-row"><td>total</td>';
  yearsWithData.forEach(y => tbody += cellsFor(y, TOTAL));
  tbody += '</tr></tbody>';
  return thead + tbody;
}

export function highlightActiveColumn() {
  // Destaca as células dos cargos marcados no dropdown
  document.querySelectorAll('.elections-table td[data-office]').forEach(td => {
    td.classList.toggle('active-office', store.selectedOffices.has(td.dataset.office));
  });
  // A linha/coluna "total" só corresponde à seleção quando TODOS os cargos estão marcados
  const allSelected = store.offices.length > 0 && store.selectedOffices.size === store.offices.length;
  document.querySelectorAll('.elections-table tr.total-row td:not(:first-child)').forEach(td => {
    td.classList.toggle('active-office', allSelected);
  });
}
