/* Estado mutável da aplicação, compartilhado entre os módulos. */

export const store = {
  activeState: 'BR',
  activeYear: 2022,
  selectedOffices: new Set(),   // cargos marcados no dropdown; soma-se o voto de todos
  voteMode: 'total',            // 'total' (contagem) ou 'relative' (% dos votos válidos)

  pstuData: {},             // dados do (estado, ano) ativos
  municipalityNames: {},    // nomes dos municípios do estado ativo
  offices: [],
  breaks: [],
  municipalitiesLayer: null,
  bordersLayer: null,       // contorno das UFs, só na visão Brasil
  currentGeojson: null,
  selectedCode: null,
};

// Cache em dois níveis: malha/nomes por estado, e dados por estado|ano.
export const meshCache = {};   // { PE: { geojson, names, borders? } }
export const dataCache = {};   // { "PE|2022": {...} }
