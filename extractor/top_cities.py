from pathlib import Path
import json

PASTA_DADOS = Path("../data")

#==============================
#    CONTROLES
#==============================
CARGO = "PRESIDENTE"
ANO = 2022
UFS = {"PE"} 
TOP_N = 10
UFS_IGNORADAS = {"ZZ"}
MIN_VOTOS_MUNICIPIO = 100_000
#==============================

arquivos = sorted(PASTA_DADOS.glob(f"*/{ANO}.json"))

linhas = []

for arquivo in arquivos:
    uf = arquivo.parent.name          # a pasta onde o arquivo está, ex: "PE"
    if uf in UFS_IGNORADAS:
        continue
    if UFS is not None and uf not in UFS:
        continue

    with open(arquivo, encoding="utf-8") as f:
        dados = json.load(f)          # vira um dicionário Python

    for codigo, municipio in dados.items():
        cargo = municipio.get(CARGO)

        if (cargo is None
                or cargo["total_municipio"] == 0
                or cargo["total_municipio"] < MIN_VOTOS_MUNICIPIO):
            continue

        if cargo is None:             # partido não teve voto ali → chave ausente
            continue

        if cargo is None or cargo["total_municipio"] == 0:
            continue

        linhas.append({
            "uf": uf,
            "codigo": codigo,
            "nome": municipio["nome"],
            "votos": cargo["total"],
            "total": cargo["total_municipio"],
            "pct": cargo["total"] / cargo["total_municipio"] * 100,
        })

ranking = sorted(linhas, key=lambda linha: linha["pct"], reverse=True)[:TOP_N]

for posicao, m in enumerate(ranking, start=1):
    print(f"{posicao:>2}. {m['nome']} ({m['uf']}) — {m['pct']:.3f}%  "
          f"({m['votos']} de {m['total']:,} votos)")