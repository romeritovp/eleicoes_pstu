/* Mapa do índice de influência: colore todos os municípios elegíveis pelo
   índice (escala contínua) e destaca com borda branca os que estão no top N. */

import { COLORS, ZERO_COLOR, BORDER_COLOR, STATE_BORDER_COLOR } from './config.js';
import { loadBrazilMesh } from './brazil-mesh.js';
import { legendRangesEl } from './influence-dom.js';

const map = L.map('map', { zoomControl: true, attributionControl: false });
map.createPane('borders');
map.getPane('borders').style.zIndex = 450;
map.getPane('borders').style.pointerEvents = 'none';
const canvasRenderer = L.canvas({ padding: 0.5 });

let municipalitiesLayer = null;
let detailByCode = {};   // código IBGE -> { name, state, index, rank? }
let breaks = [];

// Índice costuma variar numa faixa bem menor que votos absolutos (em geral
// entre 0 e poucas dezenas): a escala parte do menor valor observado, como
// a de percentual do mapa de votos, em vez de assumir magnitude >= 1.
function calculateBreaks(values) {
  if (!values.length) return [0.5, 1, 1.5, 2, 3];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [max];
  const ratio = Math.pow(max / min, 1 / 6);
  const round2 = v => Math.round(v * 100) / 100;
  const cuts = [];
  for (let i = 1; i <= 5; i++) cuts.push(round2(min * Math.pow(ratio, i)));
  return [...new Set(cuts)].filter(c => c > 0).sort((a, b) => a - b);
}

function colorFor(index) {
  if (index == null) return ZERO_COLOR;
  for (let i = 0; i < breaks.length; i++) if (index <= breaks[i]) return COLORS[i];
  return COLORS[COLORS.length - 1];
}

function styleFor(code) {
  const detail = detailByCode[code];
  const inTopN = !!(detail && detail.rank);
  return {
    fillColor: colorFor(detail ? detail.index : null),
    fillOpacity: 1,
    color: inTopN ? '#fff' : BORDER_COLOR,
    weight: inTopN ? 1.6 : 0.3,
  };
}

export async function initMap() {
  const mesh = await loadBrazilMesh();
  municipalitiesLayer = L.geoJSON(mesh.geojson, {
    renderer: canvasRenderer,
    style: f => styleFor(String(f.properties.codarea)),
  }).addTo(map);
  if (mesh.borders) {
    L.geoJSON(mesh.borders, {
      pane: 'borders', interactive: false,
      style: { fill: false, color: STATE_BORDER_COLOR, weight: 1, opacity: 0.9 },
    }).addTo(map);
  }
  map.invalidateSize();
  map.fitBounds(municipalitiesLayer.getBounds(), { padding: [20, 20] });
}

// `allResults` = todos os municípios elegíveis (porte >= mínimo), `topResults`
// = o recorte top N exibido na tabela (ganha destaque de borda no mapa).
export function updateResults(allResults, topResults) {
  detailByCode = {};
  allResults.forEach(item => {
    detailByCode[item.ibgeCode] = { name: item.name, state: item.state, index: item.index };
  });
  topResults.forEach(item => { detailByCode[item.ibgeCode].rank = item.rank; });

  breaks = calculateBreaks(allResults.map(r => r.index).filter(v => v > 0));

  if (municipalitiesLayer) {
    municipalitiesLayer.eachLayer(layer => {
      const code = String(layer.feature.properties.codarea);
      layer.setStyle(styleFor(code));
      layer.unbindTooltip();
      const detail = detailByCode[code];
      if (detail) {
        layer.bindTooltip(
          '<strong>' + detail.name + ' (' + detail.state + ')</strong><br>índice: ' + detail.index.toFixed(2) +
          (detail.rank ? '<br>#' + detail.rank + ' no ranking' : '')
        );
      }
    });
  }
  updateLegend();
}

function updateLegend() {
  legendRangesEl.innerHTML = '<div class="range"><span class="color" style="background:' + ZERO_COLOR +
    '"></span> fora do filtro</div>';
  let previous = 0;
  breaks.forEach((cut, i) => {
    legendRangesEl.innerHTML += '<div class="range"><span class="color" style="background:' + COLORS[i] +
      '"></span> ' + previous.toFixed(2) + '–' + cut.toFixed(2) + '</div>';
    previous = cut;
  });
  legendRangesEl.innerHTML += '<div class="range"><span class="color" style="background:' +
    COLORS[COLORS.length - 1] + '"></span> ' + previous.toFixed(2) + '+</div>';
}
