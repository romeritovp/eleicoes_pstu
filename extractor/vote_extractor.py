from pathlib import Path
import pandas as pd
import json

# 1–2. Ler e filtrar
root = Path('raw')
allfiles = root.glob('*/votacao_candidato_munzona_*.csv')
output = Path('data')

corresp = pd.read_csv('data/municipios_brasileiros_tse.csv')  # Brasil todo
mapa_tse_ibge = dict(zip(corresp['codigo_tse'], corresp['codigo_ibge']))

for file in allfiles:
    uf = file.stem.split('_')[-1]
    if uf in ('BR', 'BRASIL'):
        continue
    year = file.parent.name
    print(f'\n===================================\n')
    print(f'Processando {uf} {year}…')

    df = pd.read_csv(file, sep=';', encoding='latin-1')
    pstu = df[df['SG_PARTIDO'] == 'PSTU']

    if pstu.empty:
        print(f'[!] {uf} {year}: sem PSTU, pulando')
        continue

    print(f'[ok] {uf} {year}: {len(pstu):,} linhas | '
          f'{pstu["NM_URNA_CANDIDATO"].nunique()} candidatos')

    votes = (pstu.groupby(['CD_MUNICIPIO', 'NM_MUNICIPIO',
                           'DS_CARGO', 'NM_URNA_CANDIDATO'])
                 ['QT_VOTOS_NOMINAIS'].sum().reset_index())

    dados = {}
    sem_match = set()
    for _, l in votes.iterrows():
        cod_ibge = mapa_tse_ibge.get(l['CD_MUNICIPIO'])
        if cod_ibge is None:
            sem_match.add(l['NM_MUNICIPIO'])
            continue
        codigo = str(int(cod_ibge))
        cargo = l['DS_CARGO'].upper()
        cand = l['NM_URNA_CANDIDATO'].title()
        qt = int(l['QT_VOTOS_NOMINAIS'])

        dados.setdefault(codigo, {'nome': l['NM_MUNICIPIO'].title()})
        dados[codigo].setdefault(cargo, {'total': 0, 'candidatos': {}})
        dados[codigo][cargo]['total'] += qt
        dados[codigo][cargo]['candidatos'][cand] = \
            dados[codigo][cargo]['candidatos'].get(cand, 0) + qt

    if sem_match:
        print(f'[?] {uf} {year}: sem correspondência IBGE: {sem_match}')

    # salva data/<UF>/<year>.json
    pasta_uf = output / uf
    pasta_uf.mkdir(parents=True, exist_ok=True)
    with open(pasta_uf / f'{year}.json', 'w', encoding='utf-8') as f:
        json.dump(dados, f, ensure_ascii=False)

    print(f'[ok] {uf} {year}: {len(dados)} municípios salvos')