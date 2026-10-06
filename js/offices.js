/* Detecção de cargos disponíveis e cálculo da escala de cores do mapa. */

import { OFFICE_ORDER, COLORS, ZERO_COLOR } from './config.js';
import { store } from './store.js';

export function votesOf(municipality, office) {
  if (!municipality || municipality[office] == null) return 0;
  const v = municipality[office];
  return typeof v === 'object' ? (v.total || 0) : v;
}

// Soma os votos de vários cargos (ex.: todos os marcados no dropdown).
export function sumVotes(municipality, offices) {
  if (!municipality) return 0;
  return offices.reduce((sum, office) => sum + votesOf(municipality, office), 0);
}

function totalMunicipioOf(municipality, office) {
  if (!municipality || typeof municipality[office] !== 'object') return 0;
  return municipality[office].total_municipio || 0;
}

// % dos votos válidos (de todos os partidos) que o PSTU teve nos cargos somados,
// no município. A base (total_municipio) também é somada entre os cargos, para
// que o percentual combinado continue correto.
export function relativeVotes(municipality, offices) {
  if (!municipality) return 0;
  let votes = 0, base = 0;
  offices.forEach(office => { votes += votesOf(municipality, office); base += totalMunicipioOf(municipality, office); });
  return base ? (votes / base) * 100 : 0;
}

// Métrica usada para colorir o mapa/exibir nos painéis: respeita o modo ativo (totais/relativos).
export function metricFor(municipality, offices) {
  return store.voteMode === 'relative' ? relativeVotes(municipality, offices) : sumVotes(municipality, offices);
}

export function formatMetric(value) {
  return store.voteMode === 'relative'
    ? value.toLocaleString('pt-BR', { maximumFractionDigits: 3 }) + '%'
    : value.toLocaleString('pt-BR');
}

export function candidatesOf(municipality, office) {
  if (!municipality || typeof municipality[office] !== 'object') return null;
  return municipality[office].candidatos || null;
}

export function detectOffices() {
  const seen = new Set();
  Object.values(store.pstuData).forEach(municipality =>
    Object.keys(municipality).forEach(key => { if (key !== 'nome') seen.add(key); })
  );
  store.offices = OFFICE_ORDER.filter(office => seen.has(office))
    .concat([...seen].filter(office => !OFFICE_ORDER.includes(office)));
}

// Contagem de votos: tipicamente inteiros >= 1, então a escala parte de ~1 até o máximo.
function calculateVoteBreaks(values) {
  const max = Math.max(...values);
  const ratio = Math.pow(max, 1 / 6);
  const roundTo = v => {
    if (v < 10) return Math.round(v);
    const magnitude = Math.pow(10, Math.floor(Math.log10(v)));
    return Math.round(v / (magnitude / 2)) * (magnitude / 2);
  };
  const cuts = [];
  for (let i = 1; i <= 5; i++) cuts.push(roundTo(Math.pow(ratio, i)));
  return [...new Set(cuts)].filter(c => c >= 1).sort((a, b) => a - b);
}

// Percentual: costuma ficar bem abaixo de 1, então usar potências a partir de 1
// (como acima) colapsaria tudo em zero. A escala parte do menor valor observado.
function calculatePercentBreaks(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [max];
  const ratio = Math.pow(max / min, 1 / 6);
  const round3 = v => Math.round(v * 1000) / 1000;
  const cuts = [];
  for (let i = 1; i <= 5; i++) cuts.push(round3(min * Math.pow(ratio, i)));
  return [...new Set(cuts)].filter(c => c > 0).sort((a, b) => a - b);
}

export function calculateBreaks(offices) {
  const values = Object.values(store.pstuData).map(m => metricFor(m, offices)).filter(v => v > 0);
  if (!values.length) return store.voteMode === 'relative' ? [0.1, 0.5, 1, 2, 5] : [1, 2, 3, 4, 5];
  return store.voteMode === 'relative' ? calculatePercentBreaks(values) : calculateVoteBreaks(values);
}

export function colorFor(votes) {
  if (!votes) return ZERO_COLOR;
  for (let i = 0; i < store.breaks.length; i++) if (votes <= store.breaks[i]) return COLORS[i];
  return COLORS[COLORS.length - 1];
}
