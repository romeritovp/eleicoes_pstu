/* Monta os seletores de UF/ano/cargo (dropdown com checkboxes) e a legenda de cores do mapa. */

import { BRAZIL, STATES, YEARS, COLORS, ZERO_COLOR, nameOf } from './config.js';
import { store } from './store.js';
import { stateSelectEl, yearSelectorEl, officeDropdownEl, officeDropdownToggleEl,
         officeDropdownLabelEl, officeDropdownMenuEl, voteModeToggleEl, legendOfficeEl, legendRangesEl } from './dom.js';
import { calculateBreaks, formatMetric } from './offices.js';
import { repaint } from './map.js';
import { showInfo } from './info-panel.js';
import { highlightActiveColumn } from './totals-table.js';
import { loadState, changeYear } from './state-loader.js';

export function buildStateSelector() {
  stateSelectEl.innerHTML = '';
  [BRAZIL].concat(Object.keys(STATES).sort()).forEach(state => {
    const option = document.createElement('option');
    option.value = state;
    option.textContent = state + ' — ' + nameOf(state);
    stateSelectEl.appendChild(option);
  });
  stateSelectEl.value = store.activeState;
  stateSelectEl.addEventListener('change', e => loadState(e.target.value));
}

export function buildYearSelector() {
  yearSelectorEl.innerHTML = '';
  YEARS.forEach(year => {
    const button = document.createElement('button');
    button.textContent = year;
    button.dataset.year = year;
    button.addEventListener('click', () => changeYear(year));
    yearSelectorEl.appendChild(button);
  });
}

// Monta o dropdown: um checkbox "Todos" (marca/desmarca todos de uma vez)
// seguido de um checkbox por cargo detectado no pleito ativo.
export function buildOfficeSelector() {
  officeDropdownMenuEl.innerHTML = '';

  const allLabel = document.createElement('label');
  allLabel.className = 'all-option';
  const allCheckbox = document.createElement('input');
  allCheckbox.type = 'checkbox';
  allCheckbox.addEventListener('change', () => {
    setSelectedOffices(allCheckbox.checked ? [...store.offices] : []);
  });
  allLabel.append(allCheckbox, document.createTextNode('Todos'));
  officeDropdownMenuEl.appendChild(allLabel);

  store.offices.forEach(office => {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.office = office;
    checkbox.addEventListener('change', () => {
      const next = new Set(store.selectedOffices);
      checkbox.checked ? next.add(office) : next.delete(office);
      setSelectedOffices([...next]);
    });
    label.append(checkbox, document.createTextNode(office.toLowerCase()));
    officeDropdownMenuEl.appendChild(label);
  });

  syncOfficeCheckboxes();
}

export function setSelectedOffices(offices) {
  store.selectedOffices = new Set(offices);
  store.breaks = calculateBreaks([...store.selectedOffices]);
  syncOfficeCheckboxes();
  updateLegend();
  if (store.municipalitiesLayer) repaint();
  if (store.selectedCode) showInfo(store.selectedCode);
  highlightActiveColumn();
}

// Reflete store.selectedOffices nos checkboxes, no "Todos" e no rótulo do botão.
function syncOfficeCheckboxes() {
  officeDropdownMenuEl.querySelectorAll('input[data-office]').forEach(checkbox => {
    checkbox.checked = store.selectedOffices.has(checkbox.dataset.office);
  });
  const allCheckbox = officeDropdownMenuEl.querySelector('label.all-option input');
  if (allCheckbox) {
    allCheckbox.checked = store.offices.length > 0 && store.selectedOffices.size === store.offices.length;
  }
  officeDropdownLabelEl.textContent = selectionLabel() || 'cargo';
}

function selectionLabel() {
  const n = store.selectedOffices.size;
  if (n === 0) return null;
  if (store.offices.length && n === store.offices.length) return 'todos';
  if (n === 1) return [...store.selectedOffices][0].toLowerCase();
  return n + ' cargos';
}

function closeOfficeDropdown() {
  officeDropdownMenuEl.hidden = true;
  officeDropdownToggleEl.setAttribute('aria-expanded', 'false');
  officeDropdownEl.classList.remove('open');
}

officeDropdownToggleEl.addEventListener('click', () => {
  const willOpen = officeDropdownMenuEl.hidden;
  officeDropdownMenuEl.hidden = !willOpen;
  officeDropdownToggleEl.setAttribute('aria-expanded', String(willOpen));
  officeDropdownEl.classList.toggle('open', willOpen);
});
document.addEventListener('click', e => {
  if (!officeDropdownMenuEl.hidden && !officeDropdownEl.contains(e.target)) closeOfficeDropdown();
});

// Troca entre contagem absoluta de votos e % dos votos válidos no município;
// recalcula a escala de cores reaproveitando a mesma seleção de cargos.
export function setVoteMode(mode) {
  if (store.voteMode === mode) return;
  store.voteMode = mode;
  voteModeToggleEl.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  setSelectedOffices([...store.selectedOffices]);
}

voteModeToggleEl.querySelectorAll('button').forEach(button => {
  button.addEventListener('click', () => setVoteMode(button.dataset.mode));
});

function updateLegend() {
  const label = selectionLabel();
  if (!label) { legendOfficeEl.textContent = ''; legendRangesEl.innerHTML = ''; return; }
  legendOfficeEl.textContent = '· ' + label;
  // Em votos absolutos as faixas são inteiras e não se tocam ("1–5", "6–20");
  // em percentual elas são contínuas, então a próxima faixa começa no corte anterior.
  const isRelative = store.voteMode === 'relative';
  legendRangesEl.innerHTML = '<div class="range"><span class="color" style="background:' + ZERO_COLOR + '"></span> ' + formatMetric(0) + '</div>';
  let previous = isRelative ? 0 : 1;
  store.breaks.forEach((cut, i) => {
    legendRangesEl.innerHTML += '<div class="range"><span class="color" style="background:' + COLORS[i] +
      '"></span> ' + formatMetric(previous) + '–' + formatMetric(cut) + '</div>';
    previous = isRelative ? cut : cut + 1;
  });
  legendRangesEl.innerHTML += '<div class="range"><span class="color" style="background:' +
    COLORS[COLORS.length - 1] + '"></span> ' + formatMetric(previous) + '+</div>';
}
