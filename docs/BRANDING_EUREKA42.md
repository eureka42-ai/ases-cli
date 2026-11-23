# Eureka42 — Identidade no ASES CLI / ASES-TAR

## Marca escolhida e referências

O estudo recuperado `branding/references/Estudo de Marca Eureka42 - Quatro Variações.png` mostra a combinação **símbolo ⌘ (U+2318; Noto Sans Symbols 2)**, palavra **Eureka (Inter)** e **42 (Montserrat ExtraBold)**. Quatro variantes de cor: **TEAL**, **BLUE**, **PURPLE**, **GOLD**. Há também referência de emblema circular em `branding/references/Emblema Tecnológico Eureka42 AI Framework.png`; esta segunda arte é **referência complementar**, não substitui a opção de marca selecionada. Preservar as imagens originais e não adicionar fontes de terceiros ao repositório.

## Restrições do Terminal

Ink/React em terminal não pode escolher tipografia independente da fonte monoespaçada do emulador. Portanto, símbolo e wordmark devem ser aproximados por caracteres Unicode/ASCII, priorizando identidade e alinhamento, nunca prometer reprodução tipográfica idêntica. Preferir `⌘ Eureka42`, destacar `42` por estilo ANSI em terminal com cor. Logotipo deve funcionar em 40 colunas, 80 colunas e 120+ colunas.

## Comportamento

- `ases` usa full/compact/minimal/ascii adaptativo no welcome; `ases-tar` usa compact/minimal no cabeçalho.
- `--theme teal|blue|purple|gold|mono|auto`; `--logo full|compact|minimal|ascii`; `--no-banner`, `--no-animation`, `--no-color` (plano de interface, a implementar).
- `NO_COLOR=1`, `TERM=dumb`, ausência de TTY e `--json` impedem banners ANSI; `--json` mantém stdout estritamente estruturado.
- Acessibilidade: alto contraste, foco de teclado, screen-reader/logs em texto, não usar cor como único indicador de status.
- As cores HEX de `branding/BRAND_TOKENS.json` são aproximações visuais **PROPOSTAS** a calibrar; não são paleta oficial certificada por um arquivo vetorial.
- Nunca incluir ASCII art em `.ases/HISTORY.jsonl`, eventos ou payload JSON-RPC.
- Incluir smoke/golden test com representações de terminal, e snapshots dos quatro temas.

## Exemplos

```text
FULL
       ⌘   E U R E K A  42
           ASES ENGINEERING RUNTIME

COMPACT
⌘ Eureka42 | ASES CLI
⌘ Eureka42 | ASES-TAR  [LIVE]

ASCII
[E42] Eureka42 | ASES CLI
```

## Critérios de aceite

Renderização robusta em 40x16, 80x24, 120x35; no wrap indevido; `NO_COLOR` e output de pipe sem escapes; Unicode com fallback; cores com contraste; mesmo tema nos dois terminais; `npm pack` não contém arquivos de fontes.
