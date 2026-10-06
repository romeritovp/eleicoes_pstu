/* Orquestra o carregamento de uma UF (malha + divisas) e de um pleito (estado|ano). */

import { STATES, BRAZIL, nameOf, meshUrl, namesUrl } from './config.js';
import { store, meshCache } from './store.js';
import { stateTitleEl, yearTitleEl, totalsStateEl, averagesStateEl, candidateAveragesStateEl, stateSelectEl, nameEl, votesEl } from './dom.js';
import { drawMunicipalities, drawBorders, repaint } from './map.js';
import { buildOfficeSelector, setSelectedOffices } from './selectors.js';
import { buildTotalsTable } from './totals-table.js';
import { fetchData } from './elections-repository.js';
import { showStatus, hideStatus, showError } from './status.js';
import { detectOffices } from './offices.js';
import { showInfo } from './info-panel.js';
import { loadBrazilMesh } from './brazil-mesh.js';

// ---------- Carregamento de UF (malha + dados) ----------
export async function loadState(state) {
  showStatus(state === BRAZIL ? 'carregando malha nacional do IBGE (pode levar alguns segundos)…'
                              : 'carregando malha de ' + STATES[state].name + '…');
  try {
    if (!meshCache[state] && state === BRAZIL) {
      meshCache[state] = await loadBrazilMesh();
    } else if (!meshCache[state]) {
      const ibgeCode = STATES[state].ibgeCode;
      const [meshResponse, namesResponse] = await Promise.all([fetch(meshUrl(ibgeCode)), fetch(namesUrl(ibgeCode))]);
      if (!meshResponse.ok) throw new Error('malha IBGE ' + state + ' (HTTP ' + meshResponse.status + ')');
      if (!namesResponse.ok) throw new Error('nomes IBGE ' + state + ' (HTTP ' + namesResponse.status + ')');
      const geojson = await meshResponse.json();
      const municipalities = await namesResponse.json();
      const names = {};
      municipalities.forEach(m => { names[String(m.id)] = m.nome; });
      meshCache[state] = { geojson, names };
    }

    store.activeState = state;
    store.currentGeojson = meshCache[state].geojson;
    store.municipalityNames = meshCache[state].names;
    store.selectedCode = null;

    stateTitleEl.textContent = nameOf(state);
    totalsStateEl.textContent = nameOf(state);
    averagesStateEl.textContent = nameOf(state);
    candidateAveragesStateEl.textContent = nameOf(state);
    stateSelectEl.value = state;

    if (state === BRAZIL) showStatus('carregando votos de todas as UFs…');
    drawMunicipalities(store.currentGeojson);
    drawBorders(meshCache[state].borders);
    await loadYear(store.activeYear);
    await buildTotalsTable();   // varre todos os anos do estado
    hideStatus();
  } catch (error) {
    showError(error.message);
  }
}

// ---------- Carregamento de um pleito (estado|ano) ----------
export async function loadYear(year) {
  const data = await fetchData(store.activeState, year);
  store.activeYear = year;
  yearTitleEl.textContent = year;

  document.querySelectorAll('#year-selector button').forEach(b =>
    b.classList.toggle('active', Number(b.dataset.year) === year)
  );

  if (!data) {
    store.pstuData = {};
    store.offices = [];
    document.querySelectorAll('#year-selector button').forEach(b => {
      if (Number(b.dataset.year) === year) b.classList.add('unavailable');
    });
    nameEl.textContent = 'Pleito ' + year + ' indisponível em ' + store.activeState;
    votesEl.innerHTML = '';
    buildOfficeSelector();
    if (store.municipalitiesLayer) repaint();
    return;
  }

  store.pstuData = data;
  detectOffices();
  buildOfficeSelector();
  const stillValid = [...store.selectedOffices].filter(office => store.offices.includes(office));
  setSelectedOffices(stillValid.length ? stillValid : (store.offices[0] ? [store.offices[0]] : []));
}

export async function changeYear(year) {
  if (year === store.activeYear) return;
  await loadYear(year);
  if (store.selectedCode) showInfo(store.selectedCode);
}
