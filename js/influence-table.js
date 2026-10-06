/* Renderiza o ranking (posição, nome, UF, código IBGE, porte, índice e nota
   por cargo) como tabela HTML. */

import { rankingTableEl } from './influence-dom.js';

export function renderRankingTable(ranking) {
  if (!ranking.length) {
    rankingTableEl.innerHTML = '<tbody><tr><td style="color:var(--text-muted)">' +
      'Nenhum município no ranking — ajuste os filtros.</td></tr></tbody>';
    return;
  }

  // Cargos válidos são por UF: com várias UFs no ranking, municípios podem ter
  // conjuntos diferentes de notas. "—" = cargo não disputado nessa UF.
  const offices = [...new Set(ranking.flatMap(item => Object.keys(item.scores)))].sort();

  let thead = '<thead><tr><th>#</th><th>Município</th><th>UF</th><th>Código IBGE</th><th>Porte</th><th>Índice</th>';
  offices.forEach(office => thead += '<th>' + office.toLowerCase() + '</th>');
  thead += '</tr></thead>';

  let tbody = '<tbody>';
  ranking.forEach(item => {
    tbody += '<tr><td>' + item.rank + '</td><td>' + item.name + '</td><td>' + item.state + '</td>' +
             '<td>' + item.ibgeCode + '</td><td>' + item.size.toLocaleString('pt-BR') + '</td>' +
             '<td class="index-value">' + item.index.toFixed(2) + '</td>';
    offices.forEach(office => {
      tbody += '<td>' + (office in item.scores
        ? item.scores[office].toFixed(2)
        : '<span class="empty">—</span>') + '</td>';
    });
    tbody += '</tr>';
  });
  tbody += '</tbody>';

  rankingTableEl.innerHTML = thead + tbody;
}
