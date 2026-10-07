/* Renderiza o ranking (posição, nome, UF, índice, índice por ano incluído e
   porte) como tabela HTML. */

import { rankingTableEl } from './influence-dom.js';

export function renderRankingTable(ranking, years) {
  if (!ranking.length) {
    rankingTableEl.innerHTML = '<tbody><tr><td style="color:var(--text-muted)">' +
      'Nenhum município no ranking — ajuste os filtros.</td></tr></tbody>';
    return;
  }

  let thead = '<thead><tr><th>#</th><th>Município</th><th>UF</th><th>Índice</th>';
  years.forEach(year => thead += '<th>' + year + '</th>');
  thead += '<th>Porte</th></tr></thead>';

  let tbody = '<tbody>';
  ranking.forEach(item => {
    tbody += '<tr><td>' + item.rank + '</td><td>' + item.name + '</td><td>' + item.state + '</td>' +
             '<td class="index-value">' + item.index.toFixed(2) + '</td>';
    years.forEach(year => {
      tbody += '<td>' + (year in item.scoreByYear
        ? item.scoreByYear[year].toFixed(2)
        : '<span class="empty">—</span>') + '</td>';
    });
    tbody += '<td>' + item.size.toLocaleString('pt-BR') + '</td></tr>';
  });
  tbody += '</tbody>';

  rankingTableEl.innerHTML = thead + tbody;
}
