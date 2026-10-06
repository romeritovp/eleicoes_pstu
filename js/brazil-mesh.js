/* Malha nacional de municípios (IBGE), com cache: usada tanto no mapa de
   votos (visão Brasil) quanto no mapa do índice de influência. */

import { brazilMeshUrl, brazilBordersUrl, brazilNamesUrl } from './config.js';

let cache = null;

export async function loadBrazilMesh() {
  if (cache) return cache;
  const [meshResponse, bordersResponse, namesResponse] = await Promise.all(
    [fetch(brazilMeshUrl), fetch(brazilBordersUrl), fetch(brazilNamesUrl)]);
  if (!meshResponse.ok) throw new Error('malha IBGE Brasil (HTTP ' + meshResponse.status + ')');
  if (!namesResponse.ok) throw new Error('nomes IBGE Brasil (HTTP ' + namesResponse.status + ')');
  const geojson = await meshResponse.json();
  const borders = bordersResponse.ok ? await bordersResponse.json() : null;   // opcional
  const names = {};
  (await namesResponse.json()).forEach(m => { names[String(m['municipio-id'])] = m['municipio-nome']; });
  cache = { geojson, names, borders };
  return cache;
}
