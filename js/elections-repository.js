/* Busca (com cache) dos dados de votação por estado|ano, incluindo a visão Brasil. */

import { STATES, BRAZIL, dataUrl } from './config.js';
import { dataCache } from './store.js';

export async function fetchData(state, year) {
  if (state === BRAZIL) return fetchBrazilData(year);
  const key = state + '|' + year;
  if (dataCache[key] === undefined) {
    try {
      const response = await fetch(dataUrl(state, year));
      dataCache[key] = response.ok ? await response.json() : null;  // null = pleito sem arquivo
    } catch (_) {
      dataCache[key] = null;
    }
  }
  return dataCache[key];
}

// Visão nacional: junta os arquivos de todas as UFs do ano. Os códigos IBGE
// de município não se repetem entre estados, então basta mesclar os objetos.
// Quando houver PRESIDENTE nos arquivos de cada UF, ele aparece aqui somado.
async function fetchBrazilData(year) {
  const key = BRAZIL + '|' + year;
  if (dataCache[key] === undefined) {
    const perState = await Promise.all(Object.keys(STATES).map(state => fetchData(state, year)));
    const merged = Object.assign({}, ...perState.filter(Boolean));
    dataCache[key] = Object.keys(merged).length ? merged : null;
  }
  return dataCache[key];
}
