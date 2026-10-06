"""Índice de influência eleitoral por município.

Ranking dos municípios onde o partido teve desempenho acima da sua própria
média estadual, considerando todos os cargos disputados juntos — para
identificar onde concentrar esforço de organização e campanha.

Lê os arquivos `data/{UF}/{ANO}.json`, cada um um dicionário por código IBGE
de município, com `nome` e uma chave por cargo contendo `total` (votos do
partido), `total_municipio` (votos válidos do cargo no município) e
`candidatos`. O campo `percentual` do JSON (arredondado) nunca é usado aqui:
tudo é recalculado a partir de `total`/`total_municipio`.
"""
from pathlib import Path
import argparse
import json

DATA_DIR = Path(__file__).parent / 'data'


def _carregar_uf(data_dir, uf, ano):
    arquivo = Path(data_dir) / uf / f'{ano}.json'
    if not arquivo.exists():
        return None
    with open(arquivo, encoding='utf-8') as f:
        return json.load(f)


def _ufs_disponiveis(data_dir, ano):
    data_dir = Path(data_dir)
    if not data_dir.exists():
        return []
    return sorted(p.name for p in data_dir.iterdir()
                  if p.is_dir() and (p / f'{ano}.json').exists())


def _somas_por_cargo(dados):
    """Soma `total` e `total_municipio` do partido, por cargo, em toda a UF."""
    soma_total, soma_total_municipio = {}, {}
    for municipio in dados.values():
        for cargo, valores in municipio.items():
            if cargo == 'nome':
                continue
            soma_total[cargo] = soma_total.get(cargo, 0) + valores.get('total', 0)
            soma_total_municipio[cargo] = soma_total_municipio.get(cargo, 0) + valores.get('total_municipio', 0)
    return soma_total, soma_total_municipio


def _cargos_validos(soma_total, soma_total_municipio):
    """Cargos que o partido disputou na UF (votos > 0), com base de votos válidos > 0."""
    return [cargo for cargo, total in soma_total.items()
            if total > 0 and soma_total_municipio.get(cargo, 0) > 0]


def _media_estadual(cargos_validos, soma_total, soma_total_municipio):
    return {cargo: soma_total[cargo] / soma_total_municipio[cargo] * 100 for cargo in cargos_validos}


def _porte(municipio):
    """Maior `total_municipio` entre os cargos presentes: proxy do tamanho do município."""
    valores = [v.get('total_municipio', 0) for chave, v in municipio.items() if chave != 'nome']
    return max(valores) if valores else 0


def _nota_cargo(municipio, cargo, media_estadual_cargo):
    valores = municipio.get(cargo)
    if not valores or valores.get('total_municipio', 0) == 0:
        return 0.0
    percentual_municipio = valores.get('total', 0) / valores['total_municipio'] * 100
    return percentual_municipio / media_estadual_cargo


def _analisar_uf(uf, dados, min_votos_municipio):
    soma_total, soma_total_municipio = _somas_por_cargo(dados)
    cargos_validos = _cargos_validos(soma_total, soma_total_municipio)
    if not cargos_validos:
        return []

    media_estadual = _media_estadual(cargos_validos, soma_total, soma_total_municipio)

    resultados = []
    for codigo_ibge, municipio in dados.items():
        porte = _porte(municipio)
        if porte < min_votos_municipio:
            continue
        notas = {cargo: _nota_cargo(municipio, cargo, media_estadual[cargo]) for cargo in cargos_validos}
        resultados.append({
            'nome': municipio.get('nome', ''),
            'uf': uf,
            'codigo_ibge': codigo_ibge,
            'porte': porte,
            'indice': sum(notas.values()) / len(notas),
            'notas': notas,
        })
    return resultados


def calcular_indice_influencia(ano, ufs=None, ufs_ignoradas=('ZZ',),
                                min_votos_municipio=50000, top_n=10,
                                data_dir=DATA_DIR):
    """Ranking de municípios por índice de influência eleitoral do partido.

    `ufs` vazio/None analisa todas as UFs com arquivo para o `ano`. `ZZ`
    (exterior) é sempre excluído, esteja ou não em `ufs`/`ufs_ignoradas`.
    """
    excluir = set(ufs_ignoradas) | {'ZZ'}
    candidatas = [uf for uf in (ufs or _ufs_disponiveis(data_dir, ano)) if uf not in excluir]

    todos_resultados = []
    for uf in candidatas:
        dados = _carregar_uf(data_dir, uf, ano)
        if dados is None:
            continue
        todos_resultados.extend(_analisar_uf(uf, dados, min_votos_municipio))

    todos_resultados.sort(key=lambda r: r['indice'], reverse=True)
    ranking = todos_resultados[:top_n]
    for posicao, item in enumerate(ranking, start=1):
        item['posicao'] = posicao
    return ranking


def _imprimir_tabela(ranking):
    if not ranking:
        print('Nenhum município no ranking (confira os parâmetros).')
        return
    # Cargos válidos são por UF: com várias UFs no ranking, cada município pode
    # ter um conjunto diferente de notas. "—" = cargo não disputado nessa UF
    # (diferente de nota 0,00, que é cargo disputado com desempenho nulo ali).
    cargos = sorted({cargo for item in ranking for cargo in item['notas']})
    cabecalho = ['#', 'Município', 'UF', 'Código IBGE', 'Porte', 'Índice'] + cargos
    linhas = [cabecalho]
    for item in ranking:
        linhas.append([
            str(item['posicao']), item['nome'], item['uf'], item['codigo_ibge'],
            f"{item['porte']:,}".replace(',', '.'), f"{item['indice']:.2f}",
        ] + [(f"{item['notas'][c]:.2f}" if c in item['notas'] else '—') for c in cargos])
    larguras = [max(len(linha[i]) for linha in linhas) for i in range(len(cabecalho))]
    for i, linha in enumerate(linhas):
        print('  '.join(valor.ljust(larguras[j]) for j, valor in enumerate(linha)))
        if i == 0:
            print('  '.join('-' * larguras[j] for j in range(len(cabecalho))))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ano', type=int, default=2022)
    parser.add_argument('--ufs', nargs='*', default=None, help='ex.: --ufs PE AL (vazio = todas)')
    parser.add_argument('--ufs-ignoradas', nargs='*', default=['ZZ'])
    parser.add_argument('--min-votos-municipio', type=int, default=50000)
    parser.add_argument('--top-n', type=int, default=10)
    args = parser.parse_args()

    ranking = calcular_indice_influencia(
        ano=args.ano, ufs=args.ufs, ufs_ignoradas=args.ufs_ignoradas,
        min_votos_municipio=args.min_votos_municipio, top_n=args.top_n,
    )
    _imprimir_tabela(ranking)


if __name__ == '__main__':
    main()
