/* Índice de influência eleitoral — versão 2 (robusta a outliers), porta de
   extractor/influence.py.

   Para cada ano, UF e cargo:
     médiaUf       = votos do partido na UF ÷ total de votos do cargo na UF
     share ajustado = (votos + K × médiaUf) ÷ (total + K)        <- encolhimento
     nota           = mínimo(share ajustado ÷ médiaUf, TETO)      <- teto

   Índice do ano = média das notas dos cargos disputados na UF. Se a regional
   não disputou nenhum cargo ESTADUAL na UF naquele ano, o índice do ano é 0
   (mesmo havendo voto para presidente).

   Índice final = média dos índices dos anos incluídos (peso 1 cada, igual ao
   PESOS_ANOS padrão do script — por enquanto sem peso diferente por ano). */

import { STATES, YEARS } from './config.js';
import { fetchData } from './elections-repository.js';

const STATE_LEVEL_OFFICES = new Set(['GOVERNADOR', 'SENADOR', 'DEPUTADO FEDERAL', 'DEPUTADO ESTADUAL']);

function officesOf(municipality) {
  return Object.entries(municipality).filter(([key]) => key !== 'nome');
}

// Médias estaduais por cargo, em fração (não percentual): soma dos votos do
// partido ÷ soma dos votos válidos, só para cargos com as duas somas > 0.
function stateAverages(data) {
  const sumVotes = {}, sumTotal = {};
  Object.values(data).forEach(municipality => {
    officesOf(municipality).forEach(([office, values]) => {
      sumVotes[office] = (sumVotes[office] || 0) + (values.total || 0);
      sumTotal[office] = (sumTotal[office] || 0) + (values.total_municipio || 0);
    });
  });
  const averages = {};
  Object.keys(sumVotes).forEach(office => {
    if (sumVotes[office] > 0 && sumTotal[office] > 0) averages[office] = sumVotes[office] / sumTotal[office];
  });
  return averages;
}

function officeScore(presentValue, fallbackTotal, stateAverage, k, ceiling) {
  let votes, total;
  if (presentValue && presentValue.total_municipio > 0) {
    votes = presentValue.total;
    total = presentValue.total_municipio;
  } else {
    // cargo ausente no município = 0 votos; base desconhecida -> porte do ano
    votes = 0;
    total = fallbackTotal;
  }
  if (total + k === 0) return 0;
  const adjustedShare = (votes + k * stateAverage) / (total + k);
  return Math.min(adjustedShare / stateAverage, ceiling);
}

// Retorna TODOS os municípios elegíveis (porte >= mínimo) nas UFs/anos
// pedidos, ordenados do maior para o menor índice.
export async function calculateInfluence({ years, states, minMunicipalitySize, k, ceiling }) {
  const candidateStates = states && states.length ? states : Object.keys(STATES);
  const includedYears = years && years.length ? years : YEARS;

  const dataByStateYear = {};
  await Promise.all(candidateStates.map(async state => {
    const perYear = await Promise.all(includedYears.map(year => fetchData(state, year)));
    dataByStateYear[state] = {};
    includedYears.forEach((year, i) => { dataByStateYear[state][year] = perYear[i]; });
  }));

  // nome (o mais recente) e porte (maior total_municipio visto) de cada
  // município, agregando os anos incluídos.
  const names = {};        // "UF|codigo" -> nome
  const overallSizes = {}; // "UF|codigo" -> porte
  const yearsAscending = [...includedYears].sort((a, b) => a - b);
  candidateStates.forEach(state => {
    yearsAscending.forEach(year => {
      const data = dataByStateYear[state][year];
      if (!data) return;
      Object.entries(data).forEach(([ibgeCode, municipality]) => {
        const key = state + '|' + ibgeCode;
        names[key] = municipality.nome;
        const totals = officesOf(municipality).map(([, v]) => v.total_municipio || 0);
        overallSizes[key] = Math.max(overallSizes[key] || 0, 0, ...totals);
      });
    });
  });

  // médias estaduais por (UF, ano)
  const averagesByStateYear = {};
  candidateStates.forEach(state => {
    averagesByStateYear[state] = {};
    includedYears.forEach(year => {
      const data = dataByStateYear[state][year];
      averagesByStateYear[state][year] = data ? stateAverages(data) : {};
    });
  });

  const results = [];
  Object.keys(names).forEach(key => {
    const [state, ibgeCode] = key.split('|');
    const overallSize = overallSizes[key];
    if (overallSize < minMunicipalitySize) return;

    const scoreByYear = {};
    includedYears.forEach(year => {
      const averages = averagesByStateYear[state][year];
      const stateLevelActive = Object.keys(averages).some(office => STATE_LEVEL_OFFICES.has(office));
      if (!stateLevelActive) { scoreByYear[year] = 0; return; }

      const data = dataByStateYear[state][year];
      const municipality = (data && data[ibgeCode]) || {};
      const present = {};
      officesOf(municipality).forEach(([office, v]) => { present[office] = v; });
      const presentTotals = Object.values(present).map(v => v.total_municipio || 0);
      const sizeThisYear = presentTotals.length ? Math.max(...presentTotals) : overallSize;

      const scores = Object.entries(averages).map(([office, stateAverage]) =>
        officeScore(present[office], sizeThisYear, stateAverage, k, ceiling));
      scoreByYear[year] = scores.length ? scores.reduce((sum, v) => sum + v, 0) / scores.length : 0;
    });

    const index = includedYears.reduce((sum, year) => sum + scoreByYear[year], 0) / includedYears.length;
    results.push({ name: names[key], state, ibgeCode, size: overallSize, index, scoreByYear });
  });

  results.sort((a, b) => b.index - a.index);
  results.forEach((item, i) => { item.rank = i + 1; });
  return results;
}
