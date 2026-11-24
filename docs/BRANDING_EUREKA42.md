# Eureka42 — Identidade no ASES CLI / ASES-TAR

## Marca escolhida e referências

O estudo recuperado `branding/references/Estudo de Marca Eureka42 - Quatro Variações.png` mostra a combinação **símbolo ⌘ (U+2318; Noto Sans Symbols 2)**, palavra **Eureka (Inter)** e **42 (Montserrat ExtraBold)**. Quatro variantes de cor: **TEAL**, **BLUE**, **PURPLE**, **GOLD**. Há também referência de emblema circular em `branding/references/Emblema Tecnológico Eureka42 AI Framework.png`; esta segunda arte é **referência complementar**, não substitui a opção de marca selecionada. Preservar as imagens originais e não adicionar fontes de terceiros ao repositório.

## Restrições do Terminal

Ink/React em terminal não pode escolher tipografia independente da fonte monoespaçada do emulador. Portanto, símbolo e wordmark devem ser aproximados por caracteres Unicode/ASCII, priorizando identidade e alinhamento, nunca prometer reprodução tipográfica idêntica. Preferir `⌘ Eureka42`, destacar `42` por estilo ANSI em terminal com cor. Logotipo deve funcionar em 40 colunas, 80 colunas e 120+ colunas.

## Comportamento

- `ases` usa full/compact/minimal/ascii adaptativo no welcome; `ases-tar` usa compact/minimal no cabeçalho.
- `--theme auto|green|teal|blue|purple|gold|mono|contrast`; `--logo banner|full|compact|minimal|ascii`; `--no-banner`, `--no-animation`, `--no-color` (implementados na PHASE-16).
- **Precedência** (AER-REQ-249): `--theme`/`--logo` > `ui.theme`/`ui.logo` em `.ases/CONFIG.json` > os mesmos campos na config global do usuário > padrão. A config global fica em `%APPDATA%\ases\config.json` no Windows e em `$XDG_CONFIG_HOME/ases/config.json` (ou `~/.config/ases/config.json`) nos outros sistemas. Valor inválido em qualquer camada é erro que cita a origem.
- **`auto`** (padrão): `green` com 256 cores ou mais (desde a 1.1.0; antes era `teal`), `contrast` com 16 cores, `mono` sem cor.
- **Profundidade de cor:** truecolor (`COLORTERM=truecolor`, Windows Terminal, iTerm2, VS Code, WezTerm), 256 cores (`TERM=*256color`, Terminal.app) ou 16 cores (na dúvida). A paleta é aproximada para o cubo de 256 cores ou para a cor ANSI mais próxima; nada sai em truecolor num terminal de 16 cores.
- **Animação:** as TUIs não têm nenhuma (nada de spinner ou timer de desenho). `--no-animation` é aceito por compatibilidade e não muda nada. Um teste falha se aparecer um timer nas TUIs (AER-REQ-246).
- **Contraste medido** (WCAG 2.x, cor de acento sobre fundo puro):

  | Tema | Acento | Fundo preto | Fundo branco |
  |---|---|---|---|
  | green (padrão desde a 1.1.0) | `#22C55E` | 9,22 | **2,28** |
  | teal | `#009688` | 5,72 | 3,67 |
  | blue | `#184BC8` | **2,88** | 7,29 |
  | purple | `#8239B6` | 3,21 | 6,54 |
  | gold | `#D79516` | 8,20 | **2,56** |

  Leitura da tabela:
  - Todos os temas passam de 3:1, o mínimo para elemento gráfico ou texto grande em negrito, em pelo menos um fundo.
  - `blue` fica abaixo disso em fundo escuro, e `gold` e `green` em fundo claro.
  - O tema `contrast` usa a cor padrão do terminal em negrito e inverso, então tem contraste máximo em qualquer fundo.
  - O status nunca depende só da cor: o texto do estado é sempre escrito.
- `NO_COLOR=1`, `TERM=dumb`, ausência de TTY e `--json` impedem banners ANSI; `--json` mantém stdout estritamente estruturado.
- Acessibilidade: alto contraste, foco de teclado, screen-reader/logs em texto, não usar cor como único indicador de status.
- As cores HEX de `branding/BRAND_TOKENS.json` são aproximações visuais **PROPOSTAS** a calibrar; não são paleta oficial certificada por um arquivo vetorial.
- Nunca incluir ASCII art em `.ases/HISTORY.jsonl`, eventos ou payload JSON-RPC.
- Incluir smoke/golden test com representações de terminal, e snapshots dos quatro temas.

## Banner grande (1.1.0)
- **O que é:** EUREKA 42 em blocos (ANSI Shadow, 6 linhas), em verde, no topo do `ases`. Foi aprovado pelo responsável em 24/11/2026.
- **Quando aparece:** só com 72 colunas ou mais. Em janela mais estreita, aparece o logo compacto.
- **Sem Unicode:** versão com `#` e `=`.
- **No `ases-tar`:** continua o logo compacto.
- **Linha de status:** `⌘  ASES Engineering Runtime · eureka42.org · principal: <ia> · <n> IAs prontas`.

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
