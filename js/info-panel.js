/* Painel lateral com os votos do município sob o mouse/toque. */

import { BRAZIL, stateByIbgeCode } from './config.js';
import { store } from './store.js';
import { nameEl, votesEl, panelEl, mapWrapEl, totalsEl } from './dom.js';
import { candidatesOf, metricFor, formatMetric } from './offices.js';

// No mobile, o painel precisa sair de #map-wrap (altura fixa) e entrar
// no fluxo da página, antes da tabela de totais. No desktop, ele volta
// para dentro do wrap para flutuar sobre o mapa.
export function positionPanel() {
  const isMobile = window.matchMedia('(max-width: 600px)').matches;
  if (isMobile && panelEl.parentElement === mapWrapEl) {
    // tira de dentro do mapa e coloca antes da tabela de totais
    totalsEl.parentElement.insertBefore(panelEl, totalsEl);
  } else if (!isMobile && panelEl.parentElement !== mapWrapEl) {
    // devolve para dentro do mapa, onde flutua
    mapWrapEl.appendChild(panelEl);
  }
}

export function showInfo(code) {
  store.selectedCode = code;
  panelEl.classList.add('active');
  const municipality = store.pstuData[code];
  let name = (municipality && municipality.nome) || store.municipalityNames[code] || ('Município ' + code);
  if (store.activeState === BRAZIL) name += ' · ' + (stateByIbgeCode[code.slice(0, 2)] || '');
  nameEl.textContent = name;

  // No mobile o painel fica abaixo do mapa: mostra só o total do cargo
  // ativo, para não ocupar espaço. No desktop, painel completo.
  const isMobile = window.matchMedia('(max-width: 600px)').matches;

  if (isMobile) {
    if (!store.selectedOffices.size) { votesEl.innerHTML = ''; return; }
    votesEl.innerHTML =
      '<tr><td>selecionados</td>' +
      '<td class="votes">' + formatMetric(metricFor(municipality, [...store.selectedOffices])) + '</td></tr>';
    return;
  }

  // ----- Desktop: total dos cargos marcados + cada cargo, com candidatos dos marcados -----
  // (a lista de candidatos de cada cargo continua em contagem, pois não há base
  // de votos válidos por candidato — só por cargo — para calcular um percentual aí)
  let html = '';
  if (store.selectedOffices.size > 0) {
    html += '<tr class="active-office"><td>selecionados</td><td class="votes">' +
            formatMetric(metricFor(municipality, [...store.selectedOffices])) + '</td></tr>';
  }
  store.offices.forEach(office => {
    const isSelected = store.selectedOffices.has(office);
    html += '<tr' + (isSelected ? ' class="active-office"' : '') + '><td>' + office.toLowerCase() +
            '</td><td class="votes">' + formatMetric(metricFor(municipality, [office])) + '</td></tr>';
    if (isSelected) {
      const candidates = candidatesOf(municipality, office);
      if (candidates) Object.entries(candidates).sort((a, b) => b[1] - a[1]).forEach(([candidateName, count]) => {
        html += '<tr class="candidate-line"><td>↳ ' + candidateName + '</td><td class="votes">' +
                count.toLocaleString('pt-BR') + '</td></tr>';
      });
    }
  });
  votesEl.innerHTML = html || '<tr><td style="color:var(--text-muted)">sem dados</td></tr>';
}
