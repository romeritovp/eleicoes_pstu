from pathlib import Path
import pandas as pd
import json

root = Path('raw/2010')
output = Path('../data')

corresp = pd.read_csv('municipios_brasileiros_tse.csv')  # Brasil todo
mapa_tse_ibge = dict(zip(corresp['codigo_tse'], corresp['codigo_ibge']))

COLUNAS = ['NR_TURNO', 'SG_UF', 'SG_PARTIDO', 'CD_MUNICIPIO', 'NM_MUNICIPIO',
           'DS_CARGO', 'NM_URNA_CANDIDATO', 'QT_VOTOS_NOMINAIS']


def ler(file):
    """Lê um CSV do TSE (todos os partidos), só 1º turno."""
    df = pd.read_csv(file, sep=';', encoding='latin-1', usecols=COLUNAS)
    df = df[df['NR_TURNO'] == 1].copy()
    df['DS_CARGO'] = df['DS_CARGO'].str.upper()
    return df


def totais(df):
    """Total de votos nominais de todos os partidos, por (município, cargo)."""
    return (df.groupby(['CD_MUNICIPIO', 'DS_CARGO'])
              ['QT_VOTOS_NOMINAIS'].sum().to_dict())


def chave_ibge(cd_tse):
    cod = mapa_tse_ibge.get(cd_tse)
    return None if cod is None else str(int(cod))


def chave_tse(cd_tse):
    return str(int(cd_tse))


def montar(pstu, tot, chave):
    """Agrega votos do PSTU por município > cargo > candidato, com percentual."""
    votes = (pstu.groupby(['CD_MUNICIPIO', 'NM_MUNICIPIO',
                           'DS_CARGO', 'NM_URNA_CANDIDATO'])
                 ['QT_VOTOS_NOMINAIS'].sum().reset_index())

    dados, sem_match = {}, set()
    for _, l in votes.iterrows():
        cd = l['CD_MUNICIPIO']
        codigo = chave(cd)
        if codigo is None:
            sem_match.add(l['NM_MUNICIPIO'])
            continue
        cargo = l['DS_CARGO']
        cand = l['NM_URNA_CANDIDATO'].title()
        qt = int(l['QT_VOTOS_NOMINAIS'])

        dados.setdefault(codigo, {'nome': l['NM_MUNICIPIO'].title()})
        c = dados[codigo].setdefault(cargo, {
            'total': 0,
            'total_municipio': int(tot.get((cd, cargo), 0)),
            'candidatos': {},
        })
        c['total'] += qt
        c['candidatos'][cand] = c['candidatos'].get(cand, 0) + qt

    # percentual = votos PSTU / votos de todos no município, em %
    for mun in dados.values():
        for cargo, c in mun.items():
            if cargo == 'nome':
                continue
            tm = c['total_municipio']
            c['percentual'] = round(100 * c['total'] / tm, 3) if tm else 0.0

    return dados, sem_match


def salvar(dados, uf, year):
    """Salva data/<UF>/<year>.json."""
    pasta = output / uf
    pasta.mkdir(parents=True, exist_ok=True)
    with open(pasta / f'{year}.json', 'w', encoding='utf-8') as f:
        json.dump(dados, f, ensure_ascii=False)
    print(f'[ok] {uf} {year}: {len(dados)} municípios salvos')


# 1. Presidente: só no arquivo nacional _BR (inclui exterior, SG_UF == 'ZZ')
pres_br = {}
for file in root.glob('*/votacao_candidato_munzona_*_BR.csv'):
    year = file.parent.name
    pres_br[year] = ler(file)
    print(f'[ok] BR {year}: {len(pres_br[year]):,} linhas de presidente')


# 2. Estados
for file in sorted(root.glob('*/votacao_candidato_munzona_*.csv')):
    uf = file.stem.split('_')[-1]
    if uf in ('BR', 'BRASIL'):
        continue
    year = file.parent.name

    print('\n===================================\n')
    print(f'Processando {uf} {year}…')

    df = ler(file)
    extra = pres_br.get(year)
    if extra is not None:
        df = pd.concat([df, extra[extra['SG_UF'] == uf]])

    tot = totais(df)
    pstu = df[df['SG_PARTIDO'] == 'PSTU']

    if pstu.empty:
        print(f'[!] {uf} {year}: sem PSTU, pulando')
        continue

    print(f'[ok] {uf} {year}: {len(pstu):,} linhas | '
          f'{pstu["NM_URNA_CANDIDATO"].nunique()} candidatos | '
          f'cargos: {sorted(pstu["DS_CARGO"].unique())}')

    dados, sem_match = montar(pstu, tot, chave_ibge)

    if sem_match:
        print(f'[?] {uf} {year}: sem correspondência IBGE: {sem_match}')

    salvar(dados, uf, year)


# 3. Exterior
for year, d in pres_br.items():
    print('\n===================================\n')
    print(f'Processando ZZ (exterior) {year}…')

    zz = d[d['SG_UF'] == 'ZZ']
    pstu = zz[zz['SG_PARTIDO'] == 'PSTU']
    if pstu.empty:
        print(f'[!] ZZ {year}: sem votos do PSTU no exterior, pulando')
        continue

    dados, _ = montar(pstu, totais(zz), chave_tse)
    salvar(dados, 'ZZ', year)