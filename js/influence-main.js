/* Controlador da página de índice de influência: filtros customizados
   (ano, UFs, porte mínimo, top N), botão "Filtrar" e alternância mapa/tabela. */

import { STATES, YEARS } from './config.js';
import { calculateInfluence, ALL_YEARS } from './influence-calculator.js';
import { initMap, updateResults } from './influence-map.js';
import { renderRankingTable } from './influence-table.js';
import { showStatus, hideStatus, showError } from './status.js';
import {
  viewModeToggleEl, yearSelectEl,
  stateDropdownEl, stateDropdownToggleEl, stateDropdownLabelEl, stateDropdownMenuEl,
  minSizeInputEl, topNInputEl, applyFiltersButtonEl,
  mapWrapEl, tableWrapEl,
} from './influence-dom.js';

let selectedYear = YEARS[0];
const selectedStates = new Set();   // vazio = todas as UFs

function buildYearSelect() {
  yearSelectEl.innerHTML = '';
  YEARS.forEach(year => {
    const option = document.createElement('option');
    option.value = year;
    option.textContent = year;
    yearSelectEl.appendChild(option);
  });
  const allOption = document.createElement('option');
  allOption.value = ALL_YEARS;
  allOption.textContent = 'Todos (média histórica)';
  yearSelectEl.appendChild(allOption);

  yearSelectEl.value = selectedYear;
  yearSelectEl.addEventListener('change', () => {
    selectedYear = yearSelectEl.value === ALL_YEARS ? ALL_YEARS : Number(yearSelectEl.value);
  });
}

// Dropdown de UFs: "Todas" marca/desmarca as demais, igual ao de cargos do mapa de votos.
function buildStateDropdown() {
  stateDropdownMenuEl.innerHTML = '';

  const allLabel = document.createElement('label');
  allLabel.className = 'all-option';
  const allCheckbox = document.createElement('input');
  allCheckbox.type = 'checkbox';
  allCheckbox.checked = true;
  allCheckbox.addEventListener('change', () => {
    selectedStates.clear();
    stateDropdownMenuEl.querySelectorAll('input[data-state]').forEach(cb => { cb.checked = false; });
    syncStateDropdownLabel();
  });
  allLabel.append(allCheckbox, document.createTextNode('Todas'));
  stateDropdownMenuEl.appendChild(allLabel);

  Object.keys(STATES).sort().forEach(state => {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.state = state;
    checkbox.addEventListener('change', () => {
      checkbox.checked ? selectedStates.add(state) : selectedStates.delete(state);
      allCheckbox.checked = selectedStates.size === 0;
      syncStateDropdownLabel();
    });
    label.append(checkbox, document.createTextNode(state));
    stateDropdownMenuEl.appendChild(label);
  });
}

function syncStateDropdownLabel() {
  const n = selectedStates.size;
  stateDropdownLabelEl.textContent = n === 0 ? 'todas' : n === 1 ? [...selectedStates][0] : n + ' ufs';
}

function closeStateDropdown() {
  stateDropdownMenuEl.hidden = true;
  stateDropdownToggleEl.setAttribute('aria-expanded', 'false');
  stateDropdownEl.classList.remove('open');
}

stateDropdownToggleEl.addEventListener('click', () => {
  const willOpen = stateDropdownMenuEl.hidden;
  stateDropdownMenuEl.hidden = !willOpen;
  stateDropdownToggleEl.setAttribute('aria-expanded', String(willOpen));
  stateDropdownEl.classList.toggle('open', willOpen);
});
document.addEventListener('click', e => {
  if (!stateDropdownMenuEl.hidden && !stateDropdownEl.contains(e.target)) closeStateDropdown();
});

function setView(view) {
  viewModeToggleEl.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  mapWrapEl.hidden = view !== 'map';
  tableWrapEl.hidden = view !== 'table';
}
viewModeToggleEl.querySelectorAll('button').forEach(button => {
  button.addEventListener('click', () => setView(button.dataset.view));
});

async function applyFilters() {
  const minMunicipalitySize = Math.max(0, Number(minSizeInputEl.value) || 0);
  const topN = Math.max(1, Number(topNInputEl.value) || 1);

  showStatus('calculando índice de influência…');
  try {
    const allResults = await calculateInfluence({
      year: selectedYear,
      states: [...selectedStates],
      minMunicipalitySize,
    });
    const topResults = allResults.slice(0, topN);
    updateResults(allResults, topResults);
    renderRankingTable(topResults);
    hideStatus();
  } catch (error) {
    showError(error.message);
  }
}

applyFiltersButtonEl.addEventListener('click', applyFilters);

async function init() {
  buildYearSelect();
  buildStateDropdown();
  setView('map');
  await initMap();
  await applyFilters();
}

init();
