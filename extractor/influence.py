"""
Índice de influência eleitoral — versão 2 (robusta a outliers).

Modelo:

  1. Para cada ano, UF e cargo:
       média_UF   = votos do partido na UF ÷ total de votos do cargo na UF
       % ajustado = (votos + K × média_UF) ÷ (total + K)        <- encolhimento
       nota       = mínimo(% ajustado ÷ média_UF, TETO)          <- teto

  2. Índice do ano = média das notas dos cargos disputados na UF.
     Se a regional não disputou nenhum cargo ESTADUAL na UF naquele ano,
     o índice do ano é 0 (mesmo que haja voto para presidente).

  3. Índice final = média ponderada dos índices de TODOS os anos.

Leitura: 1.0 = igual à média do estado; 2.0 = o dobro; 0.5 = metade.

Para comparação, o script também roda o "modelo antigo" (K=0, sem teto)
e mostra em que posição cada cidade estaria nele.
"""

import csv
import json
import math
from pathlib import Path

# ---------------------------------------------------------------------------
# Painel de controle
# ---------------------------------------------------------------------------
PASTA_DADOS = Path("../data")
PESOS_ANOS = {2010: 1,2014: 1, 2018: 1, 2022: 1}   # anos usados e o peso de cada um
UFS = None #{"SP"}                                # ou None para todas
UFS_IGNORADAS = {"ZZ"}
K = 2_000                # votos fictícios na média do estado (encolhimento)
TETO = 5.0               # nota máxima por cargo
MIN_VOTOS_MUNICIPIO = 0  # opcional: o K já protege contra cidades pequenas
TOP_N = 15
SALVAR_CSV = None #"ranking_influencia.csv"      # ou None
DETAILS = False  # True = mostra detalhes de cada cargo do último ano

CARGOS_ESTADUAIS = {"GOVERNADOR", "SENADOR", "DEPUTADO FEDERAL", "DEPUTADO ESTADUAL"}

# ---------------------------------------------------------------------------
# Carregar todos os arquivos: dados[(uf, ano)] = dicionário do JSON ou None
# ---------------------------------------------------------------------------
ufs_disponiveis = sorted(
    p.name for p in PASTA_DADOS.iterdir()
    if p.is_dir() and p.name not in UFS_IGNORADAS
    and (UFS is None or p.name in UFS)
)

dados = {}
for uf in ufs_disponiveis:
    for ano in PESOS_ANOS:
        caminho = PASTA_DADOS / uf / f"{ano}.json"
        if caminho.exists():
            with open(caminho, encoding="utf-8") as f:
                dados[(uf, ano)] = json.load(f)
        else:
            dados[(uf, ano)] = None

print(f"UFs: {', '.join(ufs_disponiveis)}")
faltando = [f"{uf}/{ano}" for (uf, ano), d in dados.items() if d is None]
if faltando:
    print(f"Arquivos não encontrados (contam como ano sem candidatura): {', '.join(faltando)}")

# ---------------------------------------------------------------------------
# Informações fixas de cada município (somando todos os anos)
#   nome: o mais recente; porte: maior total de votos visto em qualquer cargo
# ---------------------------------------------------------------------------
def cargos_do_municipio(municipio):
    return {k: v for k, v in municipio.items() if k != "nome"}

nomes = {}
porte = {}
for (uf, ano), d in sorted(dados.items(), key=lambda item: item[0][1]):
    if d is None:
        continue
    for codigo, municipio in d.items():
        chave = (uf, codigo)
        nomes[chave] = municipio["nome"]
        totais = [v["total_municipio"] for v in cargos_do_municipio(municipio).values()]
        porte[chave] = max([porte.get(chave, 0)] + totais)

# ---------------------------------------------------------------------------
# Médias estaduais: medias[(uf, ano)] = {cargo: fração}
# ---------------------------------------------------------------------------
medias = {}
for (uf, ano), d in dados.items():
    medias[(uf, ano)] = {}
    if d is None:
        continue
    soma_votos, soma_total = {}, {}
    for municipio in d.values():
        for cargo, v in cargos_do_municipio(municipio).items():
            soma_votos[cargo] = soma_votos.get(cargo, 0) + v["total"]
            soma_total[cargo] = soma_total.get(cargo, 0) + v["total_municipio"]
    for cargo, votos in soma_votos.items():
        if votos > 0 and soma_total[cargo] > 0:
            medias[(uf, ano)][cargo] = votos / soma_total[cargo]


# ---------------------------------------------------------------------------
# O modelo, como função: assim podemos rodá-lo com parâmetros diferentes
# ---------------------------------------------------------------------------
def calcular(k, teto):
    resultado = {}
    soma_pesos = sum(PESOS_ANOS.values())

    for chave in nomes:
        uf, codigo = chave
        if porte[chave] < MIN_VOTOS_MUNICIPIO:
            continue

        por_ano = {}
        notas_por_ano = {}
        for ano in PESOS_ANOS:
            media = medias[(uf, ano)]
            regional_ativa = any(c in CARGOS_ESTADUAIS for c in media)
            if not regional_ativa:
                por_ano[ano] = 0.0
                notas_por_ano[ano] = {}
                continue

            municipio = (dados[(uf, ano)] or {}).get(codigo, {})
            presentes = cargos_do_municipio(municipio)
            # porte no ano; se a cidade não aparece no arquivo, usa o porte geral
            porte_ano = max((v["total_municipio"] for v in presentes.values()),
                            default=porte[chave])

            notas = {}
            for cargo, media_uf in media.items():
                v = presentes.get(cargo)
                if v and v["total_municipio"] > 0:
                    votos, total = v["total"], v["total_municipio"]
                else:
                    # cargo ausente = 0 votos; total desconhecido -> porte do ano
                    votos, total = 0, porte_ano

                if total + k == 0:
                    notas[cargo] = 0.0
                    continue
                pct_ajustado = (votos + k * media_uf) / (total + k)
                notas[cargo] = min(pct_ajustado / media_uf, teto)

            por_ano[ano] = sum(notas.values()) / len(notas)
            notas_por_ano[ano] = notas

        indice = sum(PESOS_ANOS[a] * por_ano[a] for a in PESOS_ANOS) / soma_pesos
        resultado[chave] = {"indice": indice, "por_ano": por_ano, "notas": notas_por_ano}

    return resultado


novo = calcular(k=K, teto=TETO)
antigo = calcular(k=0, teto=math.inf)

ordem_nova = sorted(novo, key=lambda c: novo[c]["indice"], reverse=True)
ordem_antiga = sorted(antigo, key=lambda c: antigo[c]["indice"], reverse=True)
posicao_antiga = {chave: i for i, chave in enumerate(ordem_antiga, start=1)}

# ---------------------------------------------------------------------------
# Saída
# ---------------------------------------------------------------------------
anos = list(PESOS_ANOS)
pesos_txt = ", ".join(f"{a}×{p}" for a, p in PESOS_ANOS.items())
print(f"\nTop {TOP_N} — K={K:,}  teto={TETO}  pesos: {pesos_txt}\n")
#print(f"{'#':>3}  {'antes':>5}  {'município':<30} {'índice':>6}   "
#     + "   ".join(f"{a}" for a in anos) + "    porte")
print(f"{'#':>3}  {'município':<30} {'índice':>6}   "
      + "   ".join(f"{a}" for a in anos) + "    porte")

for posicao, chave in enumerate(ordem_nova[:TOP_N], start=1):
    uf, codigo = chave
    r = novo[chave]
    anos_txt = "   ".join(f"{r['por_ano'][a]:4.2f}" for a in anos)
    nome = f"{nomes[chave]} ({uf})"
#    print(f"{posicao:>3}  {posicao_antiga[chave]:>5}  {nome:<30} {r['indice']:6.2f}   "
#          f"{anos_txt}   {porte[chave]:>8,}")
    print(f"{posicao:>3}  {nome:<30} {r['indice']:6.2f}   "
          f"{anos_txt}   {porte[chave]:>8,}")

    ultimo = anos[-1]
    if r["notas"][ultimo]:
        detalhe = "  ".join(f"{c[:4]}={n:.1f}" for c, n in sorted(r["notas"][ultimo].items()))
        if DETAILS:
            print(f"{'':>12}{ultimo}: {detalhe}")

print("\n'antes' = posição da cidade no modelo antigo (sem encolhimento e sem teto).")

if SALVAR_CSV:
    with open(SALVAR_CSV, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["posicao", "posicao_antiga", "uf", "codigo_ibge", "municipio",
                    "porte", "indice"] + [f"indice_{a}" for a in anos])
        for posicao, chave in enumerate(ordem_nova, start=1):
            uf, codigo = chave
            r = novo[chave]
            w.writerow([posicao, posicao_antiga[chave], uf, codigo, nomes[chave],
                        porte[chave], round(r["indice"], 4)]
                       + [round(r["por_ano"][a], 4) for a in anos])
    print(f"Ranking completo salvo em {SALVAR_CSV}")