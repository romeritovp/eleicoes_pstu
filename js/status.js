/* Mensagens de carregamento/erro exibidas sobre o mapa. */

import { statusEl } from './dom.js';

export function showStatus(message) { statusEl.textContent = message; statusEl.classList.remove('hidden'); }
export function hideStatus() { statusEl.classList.add('hidden'); }
export function showError(message) {
  statusEl.classList.remove('hidden');
  statusEl.innerHTML = '<div class="error">Não consegui carregar os dados.<br><br>Detalhe: ' +
    message + '<br><br>Dica: abrindo o arquivo direto (file://) o fetch é bloqueado. Rode um servidor local:' +
    '<br>python3 -m http.server 8000<br>e acesse localhost:8000</div>';
}
