/* Ponto de entrada: monta os seletores, carrega a UF ativa e cuida do boot/resize. */

import { store } from './store.js';
import { positionPanel, showInfo } from './info-panel.js';
import { buildStateSelector, buildYearSelector } from './selectors.js';
import { loadState } from './state-loader.js';
import { map } from './map.js';

function init() {
  positionPanel();
  buildStateSelector();
  buildYearSelector();
  loadState(store.activeState);
}

// Ao cruzar o limite mobile/desktop (girar a tela, redimensionar),
// re-renderiza o painel no formato certo se houver município selecionado.
window.matchMedia('(max-width: 600px)').addEventListener('change', () => {
  positionPanel();
  if (store.selectedCode) showInfo(store.selectedCode);
  map.invalidateSize();
});

init();
