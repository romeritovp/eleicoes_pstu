/* Replica as regras de indice_influencia.py: ranking de municípios com
   desempenho do partido acima da média estadual, somando todos os cargos. */

import { STATES, YEARS } from './config.js';
import { fetchData } from './elections-repository.js';

export const ALL_YEARS = 'all';

// Junta os dados de todos os anos antes de calcular: equivale a tratar a
// soma histórica de votos/base de cada cargo como se fosse "um ano só". Isso
// pondera naturalmente pelo tamanho real de cada eleição (uma eleição maior
// pesa mais), em vez de tirar a média simples dos índices de cada ano.
function mergeYearsData(perYearData) {
  const merged = {};
  perYearData.forEach(yearData => {
    if (!yearData) return;
    Object.entries(yearData).forEach(([ibgeCode, municipality]) => {
      const target = merged[ibgeCode] || (merged[ibgeCode] = { nome: municipality.nome });
      Object.entries(municipality).forEach(([office, values]) => {
        if (office === 'nome') return;
        const existing = target[office] || (target[office] = { total: 0, total_municipio: 0 });
        existing.total += values.total || 0;
        existing.total_municipio += values.total_municipio || 0;
      });
    });
  });
  return merged;
}

async function loadStateData(state, year) {
  if (year !== ALL_YEARS) return fetchData(state, year);
  const perYear = await Promise.all(YEARS.map(y => fetchData(state, y)));
  const merged = mergeYearsData(perYear);
  return Object.keys(merged).length ? merged : null;
}

function sumsByOffice(data) {
  const totalByOffice = {}, baseByOffice = {};
  Object.values(data).forEach(municipality => {
    Object.entries(municipality).forEach(([office, values]) => {
      if (office === 'nome') return;
      totalByOffice[office] = (totalByOffice[office] || 0) + (values.total || 0);
      baseByOffice[office] = (baseByOffice[office] || 0) + (values.total_municipio || 0);
    });
  });
  return { totalByOffice, baseByOffice };
}

// Só entram cargos que o partido disputou na UF (votos > 0), com base de
// votos válidos > 0 (evita divisão por zero na média estadual).
function validOffices(totalByOffice, baseByOffice) {
  return Object.keys(totalByOffice).filter(office =>
    totalByOffice[office] > 0 && (baseByOffice[office] || 0) > 0);
}

function stateAverages(offices, totalByOffice, baseByOffice) {
  const averages = {};
  offices.forEach(office => { averages[office] = (totalByOffice[office] / baseByOffice[office]) * 100; });
  return averages;
}

// Maior total_municipio entre os cargos presentes: proxy do tamanho do município.
function municipalitySize(municipality) {
  const bases = Object.entries(municipality)
    .filter(([key]) => key !== 'nome')
    .map(([, values]) => values.total_municipio || 0);
  return bases.length ? Math.max(...bases) : 0;
}

function officeScore(municipality, office, stateAverage) {
  const values = municipality[office];
  if (!values || !values.total_municipio) return 0;
  const sharePercent = (values.total / values.total_municipio) * 100;
  return sharePercent / stateAverage;
}

function analyzeState(state, data, minMunicipalitySize) {
  const { totalByOffice, baseByOffice } = sumsByOffice(data);
  const offices = validOffices(totalByOffice, baseByOffice);
  if (!offices.length) return [];

  const averages = stateAverages(offices, totalByOffice, baseByOffice);

  const results = [];
  Object.entries(data).forEach(([ibgeCode, municipality]) => {
    const size = municipalitySize(municipality);
    if (size < minMunicipalitySize) return;
    const scores = {};
    offices.forEach(office => { scores[office] = officeScore(municipality, office, averages[office]); });
    const index = Object.values(scores).reduce((sum, v) => sum + v, 0) / offices.length;
    results.push({ name: municipality.nome || '', state, ibgeCode, size, index, scores });
  });
  return results;
}

// Retorna TODOS os municípios elegíveis (porte >= mínimo) nas UFs pedidas,
// ordenados do maior para o menor índice — quem consome decide se corta em topN.
export async function calculateInfluence({ year, states, minMunicipalitySize }) {
  const candidates = states && states.length ? states : Object.keys(STATES);
  const perState = await Promise.all(candidates.map(state => loadStateData(state, year)));

  const results = [];
  candidates.forEach((state, i) => {
    const data = perState[i];
    if (data) results.push(...analyzeState(state, data, minMunicipalitySize));
  });

  results.sort((a, b) => b.index - a.index);
  results.forEach((item, i) => { item.rank = i + 1; });
  return results;
}
