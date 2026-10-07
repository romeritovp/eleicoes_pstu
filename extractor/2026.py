"""
TSE 2026 -> JSON compatível com o modelo de influência.

Baixa, para TODAS as UFs, os votos do partido (nominais + legenda)
e os votos válidos de cada cargo, município a município.

Dependência: pip install requests
"""

import csv
import json
import sys
import time
from pathlib import Path

import requests


# ============================================================
# CONFIGURAÇÃO
# ============================================================

ANO = 2026
CICLO = "ele2026"
ELEICAO_ESTADUAL = "6259"     # confira na URL do portal de resultados
ELEICAO_PRESIDENCIAL = "6257"

BASE_URL = "https://resultados.tse.jus.br/oficial"
PASTA_SAIDA = Path("../data2026")

PARTIDO = "PSTU"
NUMERO_PARTIDO = 16

# None = todas as UFs. Ex.: {"PE"} para testar antes.
UFS = None

# Pula UFs cujo arquivo já foi salvo (permite retomar após queda).
RETOMAR = True

# Chave dos municípios no JSON: código IBGE de 7 dígitos.
# De-para TSE x IBGE (CSV com colunas codigo_tse e codigo_ibge),
# procurado na mesma pasta do script. Se faltar, usa o campo "cdi"
# do arquivo de municípios do TSE.
ARQUIVO_DEPARA = Path(__file__).with_name("depara_tse_ibge.csv")

PAUSA = 0.05          # segundos entre requisições
MAX_TENTATIVAS = 6    # retry para 403/429/5xx/timeouts

CARGOS_ESTADUAIS = {
    "0003": "GOVERNADOR",
    "0005": "SENADOR",
    "0006": "DEPUTADO FEDERAL",
    "0007": "DEPUTADO ESTADUAL",
    "0008": "DEPUTADO DISTRITAL",   # só existe no DF; 404 nas demais UFs
}

CARGO_PRESIDENTE = {
    "0001": "PRESIDENTE",
}


# ============================================================
# HTTP
# ============================================================

session = requests.Session()
session.headers.update({
    "User-Agent": "Mozilla/5.0 (compatible; TSE-Eleitoral/1.0)"
})


def baixar_json(url, silencioso=False):
    """GET com retry e backoff. Retorna None em 404."""
    espera = 2
    for tentativa in range(1, MAX_TENTATIVAS + 1):
        try:
            r = session.get(url, timeout=60)
        except requests.RequestException as e:
            print(f"    ! erro de rede ({e.__class__.__name__}), "
                  f"tentativa {tentativa}/{MAX_TENTATIVAS}")
        else:
            if r.status_code == 404:
                if not silencioso:
                    print(f"    ! 404 {url}")
                return None
            if r.status_code in (403, 429) or r.status_code >= 500:
                print(f"    ! HTTP {r.status_code}, "
                      f"tentativa {tentativa}/{MAX_TENTATIVAS}")
            else:
                r.raise_for_status()
                return r.json()

        time.sleep(espera)
        espera = min(espera * 2, 120)

    raise RuntimeError(f"Falhou após {MAX_TENTATIVAS} tentativas: {url}")


def pad(eleicao):
    return str(eleicao).zfill(6)


# ============================================================
# DETECÇÃO DO PADRÃO DE NOMES DOS ARQUIVOS
# ============================================================
# O TSE já mudou o padrão entre ciclos (zeros à esquerda no código
# da eleição; sufixo -u / -v). Em vez de chutar, testamos.

FORMATO = {"pad": True, "sufixo": "u"}


def url_config(pad_codigo):
    cod = pad(ELEICAO_ESTADUAL) if pad_codigo else ELEICAO_ESTADUAL
    return (f"{BASE_URL}/{CICLO}/{ELEICAO_ESTADUAL}/config/"
            f"mun-e{cod}-cm.json")


def url_resultado(uf, codigo, cargo, eleicao):
    uf = uf.lower()
    cod = pad(eleicao) if FORMATO["pad"] else str(eleicao)
    return (f"{BASE_URL}/{CICLO}/{eleicao}/dados/{uf}/"
            f"{uf}{codigo}-c{cargo}-e{cod}-{FORMATO['sufixo']}.json")


def carregar_municipios():
    print("\nCarregando municípios...")
    for pad_codigo in (True, False):
        url = url_config(pad_codigo)
        print(f"  ↓ {url}")
        dados = baixar_json(url, silencioso=True)
        if dados:
            FORMATO["pad"] = pad_codigo
            return dados

    sys.exit(
        "\nNão encontrei o arquivo de municípios.\n"
        "Confira CICLO e ELEICAO_ESTADUAL abrindo o portal de resultados\n"
        "no navegador (F12 > Rede) e vendo as URLs que ele carrega."
    )


def detectar_sufixo(uf, codigo):
    for sufixo in ("u", "v"):
        FORMATO["sufixo"] = sufixo
        url = url_resultado(uf, codigo, "0003", ELEICAO_ESTADUAL)
        print(f"  testando {url}")
        if baixar_json(url, silencioso=True):
            print(f"  ✓ padrão: pad={FORMATO['pad']} sufixo=-{sufixo}")
            return
    sys.exit(
        "\nNão encontrei arquivos de resultado com sufixo -u nem -v.\n"
        "Abra uma URL de resultado no portal (F12 > Rede) e ajuste "
        "url_resultado()."
    )


def extrair_municipios(dados):
    resultado = []
    for uf_bloco in dados.get("abr", []):
        uf = uf_bloco.get("cd") or uf_bloco.get("sg") or uf_bloco.get("uf")
        if not uf:
            continue
        for m in uf_bloco.get("mu", []):
            if m.get("cd") is None:
                continue
            codigo_tse = str(m["cd"]).zfill(5)
            ibge = IBGE_POR_TSE.get(codigo_tse) or m.get("cdi")
            if not ibge:
                avisar("sem_ibge",
                       "município sem código IBGE (nem no de-para nem no "
                       "campo 'cdi'); usando código TSE como chave.")
            resultado.append({
                "uf": str(uf).upper(),
                "codigo": codigo_tse,
                "ibge": str(ibge) if ibge else codigo_tse,
                "nome": formatar_nome(m.get("nm")),
            })
    return resultado


# ============================================================
# EXTRAÇÃO DOS VOTOS
# ============================================================

AVISOS = set()


def avisar(chave, msg):
    if chave not in AVISOS:
        AVISOS.add(chave)
        print(f"    ⚠ {msg}")


def num(x):
    try:
        return int(x or 0)
    except (TypeError, ValueError):
        return 0


def formatar_nome(nome):
    """'SANTA ROSA DO PURUS' -> 'Santa Rosa Do Purus'; 'ZÉ MARIA' -> 'Zé Maria'."""
    return str(nome).strip().title() if nome else nome


def carregar_depara():
    if not ARQUIVO_DEPARA or not Path(ARQUIVO_DEPARA).exists():
        print(f"⚠ de-para não encontrado: {ARQUIVO_DEPARA}")
        return {}
    depara = {}
    with open(ARQUIVO_DEPARA, encoding="utf-8-sig", newline="") as f:
        for linha in csv.DictReader(f):
            tse = (linha.get("codigo_tse") or "").strip()
            ibge = (linha.get("codigo_ibge") or "").strip()
            if tse and ibge:
                depara[tse.zfill(5)] = ibge
    return depara


IBGE_POR_TSE = carregar_depara()


def votos_partido(dados, numero_partido):
    """
    Retorna (total, candidatos).

    total      = votos nominais + legenda do partido
    candidatos = {nome de urna: votos} dos candidatos do partido
    """
    if not dados:
        return 0, {}

    total = 0
    candidatos = {}

    for cargo in dados.get("carg", []):
        for agr in cargo.get("agr", []):
            for par in agr.get("par", []):
                if str(par.get("n")) != str(numero_partido):
                    continue

                cands = par.get("cand", [])
                for c in cands:
                    nome = formatar_nome(
                        c.get("nmu") or c.get("nm") or f"#{c.get('n')}"
                    )
                    candidatos[nome] = candidatos.get(nome, 0) + num(c.get("vap"))

                if "tvtn" in par or "tvtl" in par:
                    total += num(par.get("tvtn")) + num(par.get("tvtl"))
                elif cands and any("vap" in c for c in cands):
                    total += sum(num(c.get("vap")) for c in cands)
                    total += num(par.get("tvtl") or par.get("vl"))
                else:
                    avisar(
                        "estrutura_partido",
                        "bloco do partido sem campos de voto conhecidos. "
                        f"Chaves: {sorted(par.keys())}"
                    )

    return total, candidatos


def votos_validos_cargo(dados):
    if not dados:
        return 0
    v = dados.get("v", {}) or {}
    if "vv" not in v:
        avisar("estrutura_v",
               f"campo 'v.vv' ausente. Chaves de 'v': {sorted(v.keys())}")
    return num(v.get("vv"))


# ============================================================
# PROCESSAMENTO DE UMA UF
# ============================================================

def coletar(uf, codigo, cargos, eleicao, registro):
    for codigo_cargo, nome_cargo in cargos.items():
        dados = baixar_json(
            url_resultado(uf, codigo, codigo_cargo, eleicao),
            silencioso=True,
        )
        time.sleep(PAUSA)

        if not dados:
            continue

        votos, candidatos = votos_partido(dados, NUMERO_PARTIDO)
        total = votos_validos_cargo(dados)

        # Só registra o cargo se o partido disputou nesse município
        if not candidatos and votos == 0:
            continue

        registro[nome_cargo] = {
            "total": votos,
            "total_municipio": total,
            "candidatos": candidatos,
            "percentual": round(votos / total * 100, 3) if total else 0,
        }
        print(f"    {nome_cargo:<20} {votos:>10,} / {total:>10,}")


def processar_uf(uf, municipios):
    arquivo = PASTA_SAIDA / uf / f"{ANO}.json"

    if RETOMAR and arquivo.exists():
        print(f"\n↷ {uf} já salvo, pulando ({arquivo})")
        return

    print("\n" + "=" * 70)
    print(f"PROCESSANDO {uf}")
    print("=" * 70)

    municipios_uf = [m for m in municipios if m["uf"] == uf]
    saida = {}

    for i, m in enumerate(municipios_uf, start=1):
        print(f"\n[{uf} {i}/{len(municipios_uf)}] {m['nome']} ({m['codigo']})")

        registro = {"nome": m["nome"]}
        coletar(uf, m["codigo"], CARGO_PRESIDENTE,
                ELEICAO_PRESIDENCIAL, registro)

        if uf != "ZZ":  # exterior só vota para presidente
            coletar(uf, m["codigo"], CARGOS_ESTADUAIS,
                    ELEICAO_ESTADUAL, registro)

        saida[m["ibge"]] = registro

    arquivo.parent.mkdir(parents=True, exist_ok=True)
    tmp = arquivo.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(saida, f, ensure_ascii=False, indent=2)
    tmp.replace(arquivo)  # só grava o final quando a UF terminou inteira

    print(f"\n✓ Salvo: {arquivo}")


# ============================================================
# MAIN
# ============================================================

def main():
    print("=" * 70)
    print("TSE 2026 → JSON COMPATÍVEL COM O MODELO DE INFLUÊNCIA")
    print("=" * 70)
    print(f"Partido: {PARTIDO} ({NUMERO_PARTIDO})")

    municipios = extrair_municipios(carregar_municipios())
    print(f"\nMunicípios encontrados: {len(municipios):,}")

    ufs = sorted(UFS) if UFS else sorted({m["uf"] for m in municipios})
    print("UFs:", ", ".join(ufs))

    # Detecta o sufixo usando o primeiro município de uma UF real
    teste = next(m for m in municipios if m["uf"] != "ZZ")
    print(f"\nDetectando padrão dos arquivos com {teste['nome']}/{teste['uf']}...")
    detectar_sufixo(teste["uf"], teste["codigo"])

    for uf in ufs:
        processar_uf(uf, municipios)

    print("\n" + "=" * 70)
    print("CONCLUÍDO")
    if AVISOS:
        print("Houve avisos de estrutura: confira se os totais não "
              "saíram zerados.")
    print("=" * 70)


if __name__ == "__main__":
    main()