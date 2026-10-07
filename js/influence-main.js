/* Controlador da página de índice de influência: filtros customizados
   (anos, UFs, porte mínimo, top N, K, teto), botão "Filtrar" e alternância
   mapa/tabela. */

import { STATES, YEARS } from './config.js';
import { calculateInfluence } from './influence-calculator.js';
import { initMap, updateResults } from './influence-map.js';
import { renderRankingTable } from './influence-table.js';
import { showStatus, hideStatus, showError } from './status.js';
import {
  viewModeToggleEl,
  yearDropdownEl, yearDropdownToggleEl, yearDropdownLabelEl, yearDropdownMenuEl,
  stateDropdownEl, stateDropdownToggleEl, stateDropdownLabelEl, stateDropdownMenuEl,
  minSizeInputEl, topNInputEl, kInputEl, ceilingInputEl, applyFiltersButtonEl,
  mapWrapEl, tableWrapEl,
} from './influence-dom.js';

const selectedYears = new Set();    // vazio = todos os anos
const selectedStates = new Set();   // vazio = todas as UFs

// Dropdown de checkboxes com "Todos/Todas": conjunto vazio = sem restrição
// (mesma convenção usada no dropdown de cargos do mapa de votos, só que lá
// pra UF/ano "vazio" significa "inclui tudo", não "nada selecionado").
function buildCheckboxDropdown(menuEl, labelEl, items, selectedSet, { allText, formatItem, formatLabel }) {
  menuEl.innerHTML = '';

  const allCheckbox = document.createElement('input');
  allCheckbox.type = 'checkbox';
  allCheckbox.checked = true;
  const allLabel = document.createElement('label');
  allLabel.className = 'all-option';
  allLabel.append(allCheckbox, document.createTextNode(allText));
  menuEl.appendChild(allLabel);

  const sync = () => {
    allCheckbox.checked = selectedSet.size === 0;
    labelEl.textContent = formatLabel(selectedSet);
  };

  allCheckbox.addEventListener('change', () => {
    selectedSet.clear();
    menuEl.querySelectorAll('input[data-item]').forEach(cb => { cb.checked = false; });
    sync();
  });

  items.forEach(item => {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.item = item;
    checkbox.addEventListener('change', () => {
      checkbox.checked ? selectedSet.add(item) : selectedSet.delete(item);
      sync();
    });
    const label = document.createElement('label');
    label.append(checkbox, document.createTextNode(formatItem(item)));
    menuEl.appendChild(label);
  });

  sync();
}

function buildYearDropdown() {
  buildCheckboxDropdown(yearDropdownMenuEl, yearDropdownLabelEl, YEARS, selectedYears, {
    allText: 'Todos',
    formatItem: String,
    formatLabel: s => s.size === 0 ? 'todos' : s.size === 1 ? String([...s][0]) : s.size + ' anos',
  });
}

function buildStateDropdown() {
  buildCheckboxDropdown(stateDropdownMenuEl, stateDropdownLabelEl, Object.keys(STATES).sort(), selectedStates, {
    allText: 'Todas',
    formatItem: String,
    formatLabel: s => s.size === 0 ? 'todas' : s.size === 1 ? [...s][0] : s.size + ' ufs',
  });
}

function setupDropdownToggle(dropdownEl, toggleEl, menuEl) {
  toggleEl.addEventListener('click', () => {
    const willOpen = menuEl.hidden;
    menuEl.hidden = !willOpen;
    toggleEl.setAttribute('aria-expanded', String(willOpen));
    dropdownEl.classList.toggle('open', willOpen);
  });
  document.addEventListener('click', e => {
    if (!menuEl.hidden && !dropdownEl.contains(e.target)) {
      menuEl.hidden = true;
      toggleEl.setAttribute('aria-expanded', 'false');
      dropdownEl.classList.remove('open');
    }
  });
}
setupDropdownToggle(yearDropdownEl, yearDropdownToggleEl, yearDropdownMenuEl);
setupDropdownToggle(stateDropdownEl, stateDropdownToggleEl, stateDropdownMenuEl);

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
  const k = Math.max(0, Number(kInputEl.value) || 0);
  const ceiling = Math.max(0.1, Number(ceilingInputEl.value) || 0.1);

  showStatus('calculando índice de influência…');
  try {
    const allResults = await calculateInfluence({
      years: [...selectedYears],
      states: [...selectedStates],
      minMunicipalitySize,
      k,
      ceiling,
    });
    const topResults = allResults.slice(0, topN);
    updateResults(allResults, topResults);
    renderRankingTable(topResults, selectedYears.size ? [...selectedYears].sort((a, b) => a - b) : YEARS.slice().sort((a, b) => a - b));
    hideStatus();
  } catch (error) {
    showError(error.message);
  }
}

applyFiltersButtonEl.addEventListener('click', applyFilters);

async function init() {
  buildYearDropdown();
  buildStateDropdown();
  setView('map');
  await initMap();
  await applyFilters();
}

init();
