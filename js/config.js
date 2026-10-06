/* Constantes estáticas: UFs, anos, cores, URLs das APIs do IBGE/TSE. */

// Código IBGE de cada UF — necessário para montar a URL da malha.
export const STATES = {
  AC: { name: 'Acre', ibgeCode: 12 },             AL: { name: 'Alagoas', ibgeCode: 27 },
  AP: { name: 'Amapá', ibgeCode: 16 },            AM: { name: 'Amazonas', ibgeCode: 13 },
  BA: { name: 'Bahia', ibgeCode: 29 },            CE: { name: 'Ceará', ibgeCode: 23 },
  DF: { name: 'Distrito Federal', ibgeCode: 53 }, ES: { name: 'Espírito Santo', ibgeCode: 32 },
  GO: { name: 'Goiás', ibgeCode: 52 },            MA: { name: 'Maranhão', ibgeCode: 21 },
  MT: { name: 'Mato Grosso', ibgeCode: 51 },      MS: { name: 'Mato Grosso do Sul', ibgeCode: 50 },
  MG: { name: 'Minas Gerais', ibgeCode: 31 },     PA: { name: 'Pará', ibgeCode: 15 },
  PB: { name: 'Paraíba', ibgeCode: 25 },          PR: { name: 'Paraná', ibgeCode: 41 },
  PE: { name: 'Pernambuco', ibgeCode: 26 },       PI: { name: 'Piauí', ibgeCode: 22 },
  RJ: { name: 'Rio de Janeiro', ibgeCode: 33 },   RN: { name: 'Rio Grande do Norte', ibgeCode: 24 },
  RS: { name: 'Rio Grande do Sul', ibgeCode: 43 },RO: { name: 'Rondônia', ibgeCode: 11 },
  RR: { name: 'Roraima', ibgeCode: 14 },          SC: { name: 'Santa Catarina', ibgeCode: 42 },
  SP: { name: 'São Paulo', ibgeCode: 35 },        SE: { name: 'Sergipe', ibgeCode: 28 },
  TO: { name: 'Tocantins', ibgeCode: 17 },
};

export const YEARS = [2022, 2018, 2014, 2010];

// "BR" é a visão nacional: junta os dados de todas as UFs num mapa só.
export const BRAZIL = 'BR';
export const nameOf = state => state === BRAZIL ? 'Brasil' : STATES[state].name;

// Os 2 primeiros dígitos do código IBGE do município identificam a UF.
export const stateByIbgeCode = {};
Object.entries(STATES).forEach(([code, state]) => { stateByIbgeCode[state.ibgeCode] = code; });

export const meshUrl = ibgeCode =>
  'https://servicodados.ibge.gov.br/api/v3/malhas/estados/' + ibgeCode +
  '?formato=application/vnd.geo+json&qualidade=intermediaria&intrarregiao=municipio';
export const namesUrl = ibgeCode =>
  'https://servicodados.ibge.gov.br/api/v1/localidades/estados/' + ibgeCode + '/municipios';
export const dataUrl = (state, year) => 'data/' + state + '/' + year + '.json';

// Malha nacional: qualidade "minima" (~3,6 MB; a intermediária passa de 12 MB).
export const brazilMeshUrl =
  'https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR' +
  '?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=municipio';
export const brazilBordersUrl =
  'https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR' +
  '?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=UF';
export const brazilNamesUrl =
  'https://servicodados.ibge.gov.br/api/v1/localidades/municipios?view=nivelado';

export const COLORS = ['#4a2024', '#6e2225', '#932425', '#b82826', '#d92b2b', '#ff5c3d'];
export const ZERO_COLOR = getComputedStyle(document.documentElement).getPropertyValue('--municipality-zero').trim();
export const BORDER_COLOR = getComputedStyle(document.documentElement).getPropertyValue('--municipality-border').trim();
export const STATE_BORDER_COLOR = getComputedStyle(document.documentElement).getPropertyValue('--state-border').trim();

export const OFFICE_ORDER = ['PRESIDENTE', 'GOVERNADOR', 'SENADOR', 'DEPUTADO FEDERAL',
                             'DEPUTADO ESTADUAL', 'DEPUTADO DISTRITAL', 'PREFEITO', 'VEREADOR'];
