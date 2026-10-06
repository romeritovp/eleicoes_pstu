"""
Índice de influência eleitoral por município.

Para cada município, compara o desempenho do partido em cada cargo com a
média do partido no estado inteiro naquele cargo:

    índice do cargo = % no município ÷ % médio do partido na UF

    1.0 = igual à média do estado
    3.0 = três vezes a média
    0.5 = metade da média

O índice de influência do município é a média dos índices de todos os
cargos que o partido disputou naquela UF.
"""

import json
from collections import defaultdict
from pathlib import Path

# ---------------------------------------------------------------------------
# Painel de controle — mude aqui, não na lógica
# ---------------------------------------------------------------------------
PASTA_DADOS = Path("../data")      # ajuste para o caminho real da sua pasta
ANO = 2022
UFS = None #{"SP"}                     # ex: {"PE", "PB"} — ou None para todas
UFS_IGNORADAS = {"ZZ"}           # exterior
MIN_VOTOS_MUNICIPIO = 500_000     # porte mínimo da cidade
TOP_N = 10

# ---------------------------------------------------------------------------
# Encontrar os arquivos
# ---------------------------------------------------------------------------
arquivos = sorted(PASTA_DADOS.glob(f"*/{ANO}.json"))
print(f"{len(arquivos)} arquivos encontrados para {ANO}")

# ---------------------------------------------------------------------------
# Passada 1: somar votos e totais por (UF, cargo) para obter a média estadual
# ---------------------------------------------------------------------------
soma_votos = defaultdict(int)    # chave: (uf, cargo)
soma_total = defaultdict(int)
dados_por_uf = {}

for arquivo in arquivos:
    uf = arquivo.parent.name     # a UF vem do nome da pasta
    if uf in UFS_IGNORADAS:
        continue
    if UFS is not None and uf not in UFS:
        continue

    with open(arquivo, encoding="utf-8") as f:
        dados = json.load(f)
    dados_por_uf[uf] = dados     # guarda para a passada 2, sem reler o disco

    for municipio in dados.values():
        for cargo, valores in municipio.items():
            if cargo == "nome":
                continue
            soma_votos[(uf, cargo)] += valores["total"]
            soma_total[(uf, cargo)] += valores["total_municipio"]

# ---------------------------------------------------------------------------
# Passada 2: índice de cada município
# ---------------------------------------------------------------------------
linhas = []

for uf, dados in dados_por_uf.items():
    # Cargos que o partido disputou nesta UF, com a média estadual de cada um.
    # Só entram cargos com voto > 0 no estado (evita divisão por zero).
    media = {}
    for (u, cargo), votos in soma_votos.items():
        if u == uf and votos > 0:
            media[cargo] = votos / soma_total[(u, cargo)] * 100

    if not media:
        continue

    for codigo, municipio in dados.items():
        cargos_presentes = {k: v for k, v in municipio.items() if k != "nome"}

        # Porte da cidade: o maior total entre os cargos presentes
        tamanho = max(
            (v["total_municipio"] for v in cargos_presentes.values()),
            default=0,
        )
        if tamanho < MIN_VOTOS_MUNICIPIO:
            continue

        # Percorremos os cargos da UF (não os do município): se o partido
        # disputou o cargo e ele está ausente aqui, significa 0 votos.
        indices = {}
        for cargo, media_uf in media.items():
            v = municipio.get(cargo)
            if v is None or v["total_municipio"] == 0:
                indices[cargo] = 0.0
            else:
                pct = v["total"] / v["total_municipio"] * 100
                indices[cargo] = pct / media_uf

        linhas.append({
            "uf": uf,
            "codigo": codigo,
            "nome": municipio["nome"],
            "tamanho": tamanho,
            "indice": sum(indices.values()) / len(indices),
            "por_cargo": indices,
        })

# ---------------------------------------------------------------------------
# Ranking
# ---------------------------------------------------------------------------
ranking = sorted(linhas, key=lambda l: l["indice"], reverse=True)[:TOP_N]

print(f"\nTop {TOP_N} — índice de influência ({ANO}, "
      f"UFs: {'todas' if UFS is None else ', '.join(sorted(UFS))}, "
      f"mín. {MIN_VOTOS_MUNICIPIO:,} votos)\n")

for posicao, m in enumerate(ranking, start=1):
    detalhe = "  ".join(
        f"{cargo[:4]}={i:.1f}" for cargo, i in sorted(m["por_cargo"].items())
    )
    print(f"{posicao:>2}. {m['nome']} ({m['uf']}) — índice {m['indice']:.2f}"
          f"  [{m['tamanho']:,} votos]")
    #print(f"      {detalhe}")