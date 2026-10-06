/* =====================================================================
   PSTU no Brasil — coroplético por UF (ou do Brasil inteiro), com
   seletor de estado, pleito e cargo, e tabela de totais por ano.
   Estrutura de dados esperada: data/<UF>/<ano>.json
   A visão "BR" não tem arquivo próprio: soma os arquivos de todas as UFs.
   ===================================================================== */

// Código IBGE de cada UF — necessário para montar a URL da malha.
const UFS = {
  AC: { nome: 'Acre', ibge: 12 },             AL: { nome: 'Alagoas', ibge: 27 },
  AP: { nome: 'Amapá', ibge: 16 },            AM: { nome: 'Amazonas', ibge: 13 },
  BA: { nome: 'Bahia', ibge: 29 },            CE: { nome: 'Ceará', ibge: 23 },
  DF: { nome: 'Distrito Federal', ibge: 53 }, ES: { nome: 'Espírito Santo', ibge: 32 },
  GO: { nome: 'Goiás', ibge: 52 },            MA: { nome: 'Maranhão', ibge: 21 },
  MT: { nome: 'Mato Grosso', ibge: 51 },      MS: { nome: 'Mato Grosso do Sul', ibge: 50 },
  MG: { nome: 'Minas Gerais', ibge: 31 },     PA: { nome: 'Pará', ibge: 15 },
  PB: { nome: 'Paraíba', ibge: 25 },          PR: { nome: 'Paraná', ibge: 41 },
  PE: { nome: 'Pernambuco', ibge: 26 },       PI: { nome: 'Piauí', ibge: 22 },
  RJ: { nome: 'Rio de Janeiro', ibge: 33 },   RN: { nome: 'Rio Grande do Norte', ibge: 24 },
  RS: { nome: 'Rio Grande do Sul', ibge: 43 },RO: { nome: 'Rondônia', ibge: 11 },
  RR: { nome: 'Roraima', ibge: 14 },          SC: { nome: 'Santa Catarina', ibge: 42 },
  SP: { nome: 'São Paulo', ibge: 35 },        SE: { nome: 'Sergipe', ibge: 28 },
  TO: { nome: 'Tocantins', ibge: 17 },
};

const ANOS = [2022, 2018, 2014];

// "BR" é a visão nacional: junta os dados de todas as UFs num mapa só.
const BR = 'BR';
const nomeDe = uf => uf === BR ? 'Brasil' : UFS[uf].nome;
// Os 2 primeiros dígitos do código IBGE do município identificam a UF.
const SIGLA_POR_IBGE = {};
Object.entries(UFS).forEach(([sigla, u]) => { SIGLA_POR_IBGE[u.ibge] = sigla; });

const malhaUrl = ibge =>
  'https://servicodados.ibge.gov.br/api/v3/malhas/estados/' + ibge +
  '?formato=application/vnd.geo+json&qualidade=intermediaria&intrarregiao=municipio';
const nomesUrl = ibge =>
  'https://servicodados.ibge.gov.br/api/v1/localidades/estados/' + ibge + '/municipios';
const dadosUrl = (uf, ano) => 'data/' + uf + '/' + ano + '.json';

// Malha nacional: qualidade "minima" (~3,6 MB; a intermediária passa de 12 MB).
const malhaBrasilUrl =
  'https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR' +
  '?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=municipio';
const divisasBrasilUrl =
  'https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR' +
  '?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=UF';
const nomesBrasilUrl =
  'https://servicodados.ibge.gov.br/api/v1/localidades/municipios?view=nivelado';

const CORES = ['#4a2024', '#6e2225', '#932425', '#b82826', '#d92b2b', '#ff5c3d'];
const COR_ZERO  = getComputedStyle(document.documentElement).getPropertyValue('--municipio-zero').trim();
const COR_BORDA = getComputedStyle(document.documentElement).getPropertyValue('--municipio-borda').trim();
const COR_DIVISA = getComputedStyle(document.documentElement).getPropertyValue('--divisa-uf').trim();

const ORDEM_CARGOS = ['PRESIDENTE', 'GOVERNADOR', 'SENADOR', 'DEPUTADO FEDERAL',
                      'DEPUTADO ESTADUAL', 'DEPUTADO DISTRITAL', 'PREFEITO', 'VEREADOR'];

// ---------- Estado da aplicação ----------
let ufAtiva = 'RJ';
let anoAtivo = 2022;
let cargoAtivo = null;

let dadosPSTU = {};            // dados do (uf, ano) ativo
let nomePorCodigo = {};        // nomes dos municípios da UF ativa
let cargos = [];
let quebras = [];
let camadaMunicipios = null;
let camadaDivisas = null;      // contorno das UFs, só na visão Brasil
let geojsonAtual = null;
let codigoSelecionado = null;

// Cache em dois níveis: malha/nomes por UF, e dados por uf|ano
const cacheMalha = {};         // { PE: {geojson, nomes} }
const cacheDados = {};         // { "PE|2022": {...} }

const mapa = L.map('mapa', { zoomControl: true, attributionControl: false });
// Divisas estaduais ficam acima dos municípios e não capturam o mouse.
mapa.createPane('divisas');
mapa.getPane('divisas').style.zIndex = 450;
mapa.getPane('divisas').style.pointerEvents = 'none';
// Com ~5.570 polígonos, SVG fica lento: a visão Brasil usa canvas.
const rendererCanvas = L.canvas({ padding: 0.5 });
const elStatus = document.getElementById('status');
const elNome   = document.getElementById('info-nome');
const elVotos  = document.getElementById('info-votos');

const elPainel = document.getElementById('painel-info');
const elMapaWrap = document.getElementById('mapa-wrap');
const elTotais = document.getElementById('totais');

// No mobile, o painel precisa sair de #mapa-wrap (altura fixa) e entrar
// no fluxo da página, antes da tabela de totais. No desktop, ele volta
// para dentro do wrap para flutuar sobre o mapa.
function posicionarPainel() {
  const mobile = window.matchMedia('(max-width: 600px)').matches;
  if (mobile && elPainel.parentElement === elMapaWrap) {
    // tira de dentro do mapa e coloca antes da tabela de totais
    elTotais.parentElement.insertBefore(elPainel, elTotais);
  } else if (!mobile && elPainel.parentElement !== elMapaWrap) {
    // devolve para dentro do mapa, onde flutua
    elMapaWrap.appendChild(elPainel);
  }
}

// ---------- Boot ----------
function iniciar() {
  posicionarPainel();
  montarSeletorUF();
  montarSeletorAnos();
  carregarUF(ufAtiva);
}

// ---------- Carregamento de UF (malha + dados) ----------
async function carregarMalhaBrasil() {
  const [rMalha, rDivisas, rNomes] = await Promise.all(
    [fetch(malhaBrasilUrl), fetch(divisasBrasilUrl), fetch(nomesBrasilUrl)]);
  if (!rMalha.ok) throw new Error('malha IBGE Brasil (HTTP ' + rMalha.status + ')');
  if (!rNomes.ok) throw new Error('nomes IBGE Brasil (HTTP ' + rNomes.status + ')');
  const geojson = await rMalha.json();
  const divisas = rDivisas.ok ? await rDivisas.json() : null;   // opcional
  const nomes = {};
  (await rNomes.json()).forEach(m => { nomes[String(m['municipio-id'])] = m['municipio-nome']; });
  return { geojson, nomes, divisas };
}

async function carregarUF(uf) {
  mostrarStatus(uf === BR ? 'carregando malha nacional do IBGE (pode levar alguns segundos)…'
                          : 'carregando malha de ' + UFS[uf].nome + '…');
  try {
    if (!cacheMalha[uf] && uf === BR) {
      cacheMalha[uf] = await carregarMalhaBrasil();
    } else if (!cacheMalha[uf]) {
      const ibge = UFS[uf].ibge;
      const [rMalha, rNomes] = await Promise.all([fetch(malhaUrl(ibge)), fetch(nomesUrl(ibge))]);
      if (!rMalha.ok) throw new Error('malha IBGE ' + uf + ' (HTTP ' + rMalha.status + ')');
      if (!rNomes.ok) throw new Error('nomes IBGE ' + uf + ' (HTTP ' + rNomes.status + ')');
      const geojson = await rMalha.json();
      const munic = await rNomes.json();
      const nomes = {};
      munic.forEach(m => { nomes[String(m.id)] = m.nome; });
      cacheMalha[uf] = { geojson, nomes };
    }

    ufAtiva = uf;
    geojsonAtual = cacheMalha[uf].geojson;
    nomePorCodigo = cacheMalha[uf].nomes;
    codigoSelecionado = null;

    document.getElementById('titulo-uf').textContent = nomeDe(uf);
    document.getElementById('totais-uf').textContent = nomeDe(uf);
    document.getElementById('medias-uf').textContent = nomeDe(uf);
    document.getElementById('medias-cand-uf').textContent = nomeDe(uf);
    document.getElementById('seletor-uf').value = uf;

    if (uf === BR) mostrarStatus('carregando votos de todas as UFs…');
    desenharMunicipios(geojsonAtual);
    desenharDivisas(cacheMalha[uf].divisas);
    await carregarAno(anoAtivo);
    await montarTabelaTotais();   // varre todos os anos da UF
    ocultarStatus();
  } catch (erro) {
    mostrarErro(erro.message);
  }
}

// ---------- Carregamento de um pleito (uf|ano) ----------
async function buscarDados(uf, ano) {
  if (uf === BR) return buscarDadosBrasil(ano);
  const chave = uf + '|' + ano;
  if (cacheDados[chave] === undefined) {
    try {
      const resp = await fetch(dadosUrl(uf, ano));
      cacheDados[chave] = resp.ok ? await resp.json() : null;  // null = pleito sem arquivo
    } catch (_) {
      cacheDados[chave] = null;
    }
  }
  return cacheDados[chave];
}

// Visão nacional: junta os arquivos de todas as UFs do ano. Os códigos IBGE
// de município não se repetem entre estados, então basta mesclar os objetos.
// Quando houver PRESIDENTE nos arquivos de cada UF, ele aparece aqui somado.
async function buscarDadosBrasil(ano) {
  const chave = BR + '|' + ano;
  if (cacheDados[chave] === undefined) {
    const porUF = await Promise.all(Object.keys(UFS).map(uf => buscarDados(uf, ano)));
    const juntos = Object.assign({}, ...porUF.filter(Boolean));
    cacheDados[chave] = Object.keys(juntos).length ? juntos : null;
  }
  return cacheDados[chave];
}

async function carregarAno(ano) {
  const dados = await buscarDados(ufAtiva, ano);
  anoAtivo = ano;
  document.getElementById('titulo-ano').textContent = ano;

  document.querySelectorAll('#seletor-ano button').forEach(b =>
    b.classList.toggle('ativo', Number(b.dataset.ano) === ano)
  );

  if (!dados) {
    dadosPSTU = {};
    cargos = [];
    document.querySelectorAll('#seletor-ano button').forEach(b => {
      if (Number(b.dataset.ano) === ano) b.classList.add('indisponivel');
    });
    elNome.textContent = 'Pleito ' + ano + ' indisponível em ' + ufAtiva;
    elVotos.innerHTML = '';
    montarSeletor();
    if (camadaMunicipios) repintar();
    return;
  }

  dadosPSTU = dados;
  detectarCargos();
  montarSeletor();
  definirCargo(cargos.includes(cargoAtivo) ? cargoAtivo : cargos[0]);
}

async function trocarAno(ano) {
  if (ano === anoAtivo) return;
  await carregarAno(ano);
  if (codigoSelecionado) mostrarInfo(codigoSelecionado);
}

// ---------- Detecção de cargos e escala ----------
function votosDe(municipio, cargo) {
  if (!municipio || municipio[cargo] == null) return 0;
  const v = municipio[cargo];
  return typeof v === 'object' ? (v.total || 0) : v;
}
function candidatosDe(municipio, cargo) {
  if (!municipio || typeof municipio[cargo] !== 'object') return null;
  return municipio[cargo].candidatos || null;
}

function detectarCargos() {
  const conjunto = new Set();
  Object.values(dadosPSTU).forEach(m =>
    Object.keys(m).forEach(k => { if (k !== 'nome') conjunto.add(k); })
  );
  cargos = ORDEM_CARGOS.filter(c => conjunto.has(c))
                       .concat([...conjunto].filter(c => !ORDEM_CARGOS.includes(c)));
}

function calcularQuebras(cargo) {
  const valores = Object.values(dadosPSTU).map(m => votosDe(m, cargo)).filter(v => v > 0);
  if (!valores.length) return [1, 2, 3, 4, 5];
  const max = Math.max(...valores);
  const razao = Math.pow(max, 1 / 6);
  const arredondar = v => {
    if (v < 10) return Math.round(v);
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    return Math.round(v / (mag / 2)) * (mag / 2);
  };
  const cortes = [];
  for (let i = 1; i <= 5; i++) cortes.push(arredondar(Math.pow(razao, i)));
  return [...new Set(cortes)].filter(c => c >= 1).sort((a, b) => a - b);
}

function corPara(votos) {
  if (!votos) return COR_ZERO;
  for (let i = 0; i < quebras.length; i++) if (votos <= quebras[i]) return CORES[i];
  return CORES[CORES.length - 1];
}

// ---------- Seletores ----------
function montarSeletorUF() {
  const sel = document.getElementById('seletor-uf');
  sel.innerHTML = '';
  [BR].concat(Object.keys(UFS).sort()).forEach(uf => {
    const opt = document.createElement('option');
    opt.value = uf;
    opt.textContent = uf + ' — ' + nomeDe(uf);
    sel.appendChild(opt);
  });
  sel.value = ufAtiva;
  sel.addEventListener('change', e => carregarUF(e.target.value));
}

function montarSeletorAnos() {
  const nav = document.getElementById('seletor-ano');
  nav.innerHTML = '';
  ANOS.forEach(ano => {
    const btn = document.createElement('button');
    btn.textContent = ano;
    btn.dataset.ano = ano;
    btn.addEventListener('click', () => trocarAno(ano));
    nav.appendChild(btn);
  });
}

function montarSeletor() {
  const nav = document.getElementById('seletor-cargo');
  nav.innerHTML = '';
  cargos.forEach(cargo => {
    const btn = document.createElement('button');
    btn.textContent = cargo.toLowerCase();
    btn.dataset.cargo = cargo;
    btn.addEventListener('click', () => definirCargo(cargo));
    nav.appendChild(btn);
  });
}

function definirCargo(cargo) {
  cargoAtivo = cargo;
  quebras = calcularQuebras(cargo);
  document.querySelectorAll('#seletor-cargo button').forEach(b =>
    b.classList.toggle('ativo', b.dataset.cargo === cargo)
  );
  atualizarLegenda();
  if (camadaMunicipios) repintar();
  if (codigoSelecionado) mostrarInfo(codigoSelecionado);
  marcarColunaAtiva();
}

function atualizarLegenda() {
  if (!cargoAtivo) { document.getElementById('legenda-faixas').innerHTML = ''; return; }
  document.getElementById('legenda-cargo').textContent = '· ' + cargoAtivo.toLowerCase();
  const faixas = document.getElementById('legenda-faixas');
  faixas.innerHTML = '<div class="faixa"><span class="cor" style="background:' + COR_ZERO + '"></span> 0</div>';
  let anterior = 1;
  quebras.forEach((corte, i) => {
    faixas.innerHTML += '<div class="faixa"><span class="cor" style="background:' + CORES[i] +
      '"></span> ' + anterior + '–' + corte + '</div>';
    anterior = corte + 1;
  });
  faixas.innerHTML += '<div class="faixa"><span class="cor" style="background:' +
    CORES[CORES.length - 1] + '"></span> ' + anterior + '+</div>';
}

// ---------- Mapa ----------
// No Brasil inteiro os municípios são minúsculos: borda mais fina.
const espessuraBorda = () => ufAtiva === BR ? 0.2 : 0.7;

function estiloDe(codigo) {
  return { fillColor: corPara(votosDe(dadosPSTU[codigo], cargoAtivo)),
           fillOpacity: 1, color: COR_BORDA, weight: espessuraBorda() };
}

function desenharMunicipios(geojson) {
  if (camadaMunicipios) { mapa.removeLayer(camadaMunicipios); camadaMunicipios = null; }
  camadaMunicipios = L.geoJSON(geojson, {
    renderer: ufAtiva === BR ? rendererCanvas : undefined,
    style: f => estiloDe(String(f.properties.codarea)),
    onEachFeature: (feature, layer) => {
      const codigo = String(feature.properties.codarea);
      layer.on('mouseover', () => { layer.setStyle({ color: '#fff', weight: 1.4 }); layer.bringToFront(); mostrarInfo(codigo); });
      layer.on('mouseout', () => layer.setStyle({ color: COR_BORDA, weight: espessuraBorda() }));
      layer.on('click', () => mostrarInfo(codigo));
    },
  }).addTo(mapa);
  // o container pode ter mudado de tamanho (troca de UF, layout mobile):
  // força o Leaflet a recalcular as dimensões antes de enquadrar
  mapa.invalidateSize();
  mapa.fitBounds(camadaMunicipios.getBounds(), { padding: [20, 20] });
}

function desenharDivisas(divisas) {
  if (camadaDivisas) { mapa.removeLayer(camadaDivisas); camadaDivisas = null; }
  if (!divisas) return;
  camadaDivisas = L.geoJSON(divisas, {
    pane: 'divisas', interactive: false,
    style: { fill: false, color: COR_DIVISA, weight: 1, opacity: 0.9 },
  }).addTo(mapa);
}

function repintar() {
  if (!camadaMunicipios) return;
  camadaMunicipios.eachLayer(layer =>
    layer.setStyle(estiloDe(String(layer.feature.properties.codarea))));
}

function mostrarInfo(codigo) {
  codigoSelecionado = codigo;
  elPainel.classList.add('ativo');
  const municipio = dadosPSTU[codigo];
  let nome = (municipio && municipio.nome) || nomePorCodigo[codigo] || ('Município ' + codigo);
  if (ufAtiva === BR) nome += ' · ' + (SIGLA_POR_IBGE[codigo.slice(0, 2)] || '');
  elNome.textContent = nome;

  // No mobile o painel fica abaixo do mapa: mostra só o total do cargo
  // ativo, para não ocupar espaço. No desktop, painel completo.
  const mobile = window.matchMedia('(max-width: 600px)').matches;

  if (mobile) {
    if (!cargoAtivo) { elVotos.innerHTML = ''; return; }
    elVotos.innerHTML =
      '<tr><td>' + cargoAtivo.toLowerCase() + '</td>' +
      '<td class="votos">' + votosDe(municipio, cargoAtivo).toLocaleString('pt-BR') + '</td></tr>';
    return;
  }

  // ----- Desktop: lista todos os cargos + candidatos do cargo ativo -----
  let html = '';
  cargos.forEach(cargo => {
    const ativo = cargo === cargoAtivo;
    html += '<tr' + (ativo ? ' class="cargo-ativo"' : '') + '><td>' + cargo.toLowerCase() +
            '</td><td class="votos">' + votosDe(municipio, cargo).toLocaleString('pt-BR') + '</td></tr>';
    if (ativo) {
      const cand = candidatosDe(municipio, cargo);
      if (cand) Object.entries(cand).sort((a, b) => b[1] - a[1]).forEach(([nome, qt]) => {
        html += '<tr class="linha-candidato"><td>↳ ' + nome + '</td><td class="votos">' +
                qt.toLocaleString('pt-BR') + '</td></tr>';
      });
    }
  });
  elVotos.innerHTML = html || '<tr><td style="color:var(--texto-suave)">sem dados</td></tr>';
}

// ---------- Tabela de totais por ano ----------
async function montarTabelaTotais() {
  // Busca todos os anos da UF ativa (usa cache) e soma por cargo.
  const porAno = {};                  // { 2022: { GOVERNADOR: 1745, ... }, ... }
  const candAno = {};                 // { 2022: Map{candidato -> {cargo, votos}}, ... }
  const valoresAno = {};              // { 2022: { GOVERNADOR: [votos por município], ... } }
  const valoresCandAno = {};          // { 2022: { GOVERNADOR: [votos por candidato], ... } }
  const cargosVistos = new Set();

  for (const ano of ANOS) {
    const dados = await buscarDados(ufAtiva, ano);
    if (!dados) { porAno[ano] = null; continue; }
    const soma = {};
    const valores = { [TOTAL]: [] };
    const porCandidato = new Map();   // candidatos únicos do ano (todos os cargos)
    Object.entries(dados).forEach(([codigo, m]) => {
      let totalMunicipio = 0;
      Object.keys(m).forEach(k => {
        if (k === 'nome') return;
        cargosVistos.add(k);
        const v = votosDe(m, k);
        soma[k] = (soma[k] || 0) + v;
        (valores[k] = valores[k] || []).push(v);
        totalMunicipio += v;
        // soma os votos de cada candidato, juntando todos os municípios
        const cand = candidatosDe(m, k);
        if (cand) Object.entries(cand).forEach(([nome, qt]) => {
          const chave = chaveCandidato(k, nome, codigo);
          const c = porCandidato.get(chave) || { cargo: k, votos: 0 };
          c.votos += qt;
          porCandidato.set(chave, c);
        });
      });
      valores[TOTAL].push(totalMunicipio);
    });
    const valoresCand = { [TOTAL]: [] };
    porCandidato.forEach(({ cargo, votos }) => {
      (valoresCand[cargo] = valoresCand[cargo] || []).push(votos);
      valoresCand[TOTAL].push(votos);
    });
    porAno[ano] = soma;
    candAno[ano] = porCandidato;
    valoresAno[ano] = valores;
    valoresCandAno[ano] = valoresCand;
  }

  const listaCargos = ORDEM_CARGOS.filter(c => cargosVistos.has(c))
    .concat([...cargosVistos].filter(c => !ORDEM_CARGOS.includes(c)));

  const tabela = document.getElementById('tabela-totais');
  const tabelaMedias = document.getElementById('tabela-medias');
  const tabelaMediasCand = document.getElementById('tabela-medias-candidato');
  if (!listaCargos.length) {
    tabela.innerHTML = '<tbody><tr><td style="color:var(--texto-suave)">Nenhum dado disponível para ' + nomeDe(ufAtiva) + '.</td></tr></tbody>';
    tabelaMedias.innerHTML = '';
    tabelaMediasCand.innerHTML = '';
    return;
  }

  // Cabeçalho: Cargo | 2014 | 2016 | ... (só anos com dados)
  const anosComDados = ANOS.filter(a => porAno[a]).sort((a, b) => a - b);
  let thead = '<thead><tr><th>Cargo</th>';
  anosComDados.forEach(a => thead += '<th data-ano="' + a + '">' + a + '</th>');
  thead += '</tr></thead>';

  let tbody = '<tbody>';
  listaCargos.forEach(cargo => {
    tbody += '<tr><td>' + cargo.toLowerCase() + '</td>';
    anosComDados.forEach(a => {
      const v = porAno[a][cargo];
      tbody += '<td data-ano="' + a + '" data-cargo="' + cargo + '">' +
               (v ? v.toLocaleString('pt-BR') : '<span class="vazio">—</span>') + '</td>';
    });
    tbody += '</tr>';
  });

  // Linha: nº de candidaturas distintas do PSTU por ano
  tbody += '<tr class="linha-candidatos"><td>candidatos</td>';
  anosComDados.forEach(a => {
    tbody += '<td>' + (candAno[a] ? candAno[a].size.toLocaleString('pt-BR') : '—') + '</td>';
  });
  tbody += '</tr>';

  // Linha de total geral por ano
  tbody += '<tr class="linha-total"><td>total</td>';
  anosComDados.forEach(a => {
    const tot = Object.values(porAno[a]).reduce((s, v) => s + v, 0);
    tbody += '<td>' + tot.toLocaleString('pt-BR') + '</td>';
  });
  tbody += '</tr></tbody>';

  tabela.innerHTML = thead + tbody;
  tabelaMedias.innerHTML = htmlTabelaMedias(listaCargos, anosComDados, valoresAno);
  tabelaMediasCand.innerHTML = htmlTabelaMedias(listaCargos, anosComDados, valoresCandAno);
  marcarColunaAtiva();
}

// Identifica um candidato de forma única no ano. Os nomes vêm com espaços
// sobrando ("Katiany  "), então normaliza. Na visão Brasil, o mesmo nome
// pode ser de pessoas diferentes em UFs diferentes, por isso a UF entra na
// chave; a exceção é PRESIDENTE, que é o mesmo candidato no país todo.
function chaveCandidato(cargo, nome, codigoMunicipio) {
  const uf = cargo === 'PRESIDENTE' ? '' : codigoMunicipio.slice(0, 2);
  return cargo + '|' + uf + '|' + nome.trim().replace(/\s+/g, ' ');
}

// ---------- Tabelas de média e mediana ----------
// Mesmas linhas da tabela de totais; cada ano tem duas colunas.
// - por município: base são os municípios presentes no arquivo do pleito
//   (inclusive os com 0 voto);
// - por candidato: base é o total de votos de cada candidato no recorte
//   (UF ou Brasil). Na linha "total", entram todos os candidatos do ano.
const TOTAL = '__total__';

function media(valores) {
  return valores.reduce((s, v) => s + v, 0) / valores.length;
}
function mediana(valores) {
  const ord = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ord.length / 2);
  return ord.length % 2 ? ord[meio] : (ord[meio - 1] + ord[meio]) / 2;
}
const fmtDecimal = v => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

function htmlTabelaMedias(listaCargos, anosComDados, valoresAno) {
  let thead = '<thead><tr><th rowspan="2">Cargo</th>';
  anosComDados.forEach(a => thead += '<th colspan="2" class="ano-grupo" data-ano="' + a + '">' + a + '</th>');
  thead += '</tr><tr>';
  anosComDados.forEach(() => thead += '<th class="sub">média</th><th class="sub">mediana</th>');
  thead += '</tr></thead>';

  const celulas = (a, chave) => {
    const vals = valoresAno[a][chave];
    const attr = chave === TOTAL ? '' : ' data-cargo="' + chave + '"';
    if (!vals || !vals.length) return ('<td' + attr + '><span class="vazio">—</span></td>').repeat(2);
    return '<td' + attr + '>' + fmtDecimal(media(vals)) + '</td>' +
           '<td' + attr + '>' + fmtDecimal(mediana(vals)) + '</td>';
  };

  let tbody = '<tbody>';
  listaCargos.forEach(cargo => {
    tbody += '<tr><td>' + cargo.toLowerCase() + '</td>';
    anosComDados.forEach(a => tbody += celulas(a, cargo));
    tbody += '</tr>';
  });
  tbody += '<tr class="linha-total"><td>total</td>';
  anosComDados.forEach(a => tbody += celulas(a, TOTAL));
  tbody += '</tr></tbody>';
  return thead + tbody;
}

function marcarColunaAtiva() {
  // Destaca a coluna do ano ativo e as células do cargo ativo
  document.querySelectorAll('.tabela-pleitos td[data-cargo]').forEach(td => {
    td.classList.toggle('cargo-ativo', td.dataset.cargo === cargoAtivo);
  });
}

// ---------- Status ----------
function mostrarStatus(msg) { elStatus.textContent = msg; elStatus.classList.remove('oculto'); }
function ocultarStatus() { elStatus.classList.add('oculto'); }
function mostrarErro(msg) {
  elStatus.classList.remove('oculto');
  elStatus.innerHTML = '<div class="erro">Não consegui carregar os dados.<br><br>Detalhe: ' +
    msg + '<br><br>Dica: abrindo o arquivo direto (file://) o fetch é bloqueado. Rode um servidor local:' +
    '<br>python3 -m http.server 8000<br>e acesse localhost:8000</div>';
}

// Ao cruzar o limite mobile/desktop (girar a tela, redimensionar),
// re-renderiza o painel no formato certo se houver município selecionado.
window.matchMedia('(max-width: 600px)').addEventListener('change', () => {
  posicionarPainel();
  if (codigoSelecionado) mostrarInfo(codigoSelecionado);
  mapa.invalidateSize();
});

iniciar();