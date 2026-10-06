/* Instância do Leaflet e desenho das camadas de municípios/divisas. */

import { BRAZIL, BORDER_COLOR, STATE_BORDER_COLOR } from './config.js';
import { store } from './store.js';
import { metricFor, colorFor } from './offices.js';
import { showInfo } from './info-panel.js';

export const map = L.map('map', { zoomControl: true, attributionControl: false });
// Divisas estaduais ficam acima dos municípios e não capturam o mouse.
map.createPane('borders');
map.getPane('borders').style.zIndex = 450;
map.getPane('borders').style.pointerEvents = 'none';
// Com ~5.570 polígonos, SVG fica lento: a visão Brasil usa canvas.
export const canvasRenderer = L.canvas({ padding: 0.5 });

// No Brasil inteiro os municípios são minúsculos: borda mais fina.
const borderWidth = () => store.activeState === BRAZIL ? 0.2 : 0.7;

function styleFor(code) {
  return { fillColor: colorFor(metricFor(store.pstuData[code], [...store.selectedOffices])),
           fillOpacity: 1, color: BORDER_COLOR, weight: borderWidth() };
}

export function drawMunicipalities(geojson) {
  if (store.municipalitiesLayer) { map.removeLayer(store.municipalitiesLayer); store.municipalitiesLayer = null; }
  store.municipalitiesLayer = L.geoJSON(geojson, {
    renderer: store.activeState === BRAZIL ? canvasRenderer : undefined,
    style: f => styleFor(String(f.properties.codarea)),
    onEachFeature: (feature, layer) => {
      const code = String(feature.properties.codarea);
      layer.on('mouseover', () => { layer.setStyle({ color: '#fff', weight: 1.4 }); layer.bringToFront(); showInfo(code); });
      layer.on('mouseout', () => layer.setStyle({ color: BORDER_COLOR, weight: borderWidth() }));
      layer.on('click', () => showInfo(code));
    },
  }).addTo(map);
  // o container pode ter mudado de tamanho (troca de UF, layout mobile):
  // força o Leaflet a recalcular as dimensões antes de enquadrar
  map.invalidateSize();
  map.fitBounds(store.municipalitiesLayer.getBounds(), { padding: [20, 20] });
}

export function drawBorders(borders) {
  if (store.bordersLayer) { map.removeLayer(store.bordersLayer); store.bordersLayer = null; }
  if (!borders) return;
  store.bordersLayer = L.geoJSON(borders, {
    pane: 'borders', interactive: false,
    style: { fill: false, color: STATE_BORDER_COLOR, weight: 1, opacity: 0.9 },
  }).addTo(map);
}

export function repaint() {
  if (!store.municipalitiesLayer) return;
  store.municipalitiesLayer.eachLayer(layer =>
    layer.setStyle(styleFor(String(layer.feature.properties.codarea))));
}
