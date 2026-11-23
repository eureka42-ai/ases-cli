# TUI-UX — `ases` e `ases-tar`

> Situação: PHASE-04. Os quadros abaixo são **capturas da renderização real** (Ink num stdout de largura fixa, sem cor; o horário foi normalizado), e não desenhos. Implementação em `apps/*/src/tui.tsx` e `packages/tui-shared`.

## Quando cada modo é usado
| Situação | `ases` | `ases-tar` |
|---|---|---|
| stdin **e** stdout TTY, `TERM≠dumb` | TUI Ink | TUI Ink |
| pipe, script, CI, `TERM=dumb` ou `--no-tui` | modo linha (`ases> ` via readline) | texto linha a linha |
| `--json` | só JSON | snapshot JSON único |
| `--follow --format jsonl` | — | JSONL puro no stdout; estado da conexão no stderr |

## `ases` (110×14)
```text
⌘ Eureka42 | ASES CLI ● LIVE  demo · seq 5 · monitores 0
╭───────────────────────────────────────────────────────────────────╮╭───────────────────────────────────────╮
│ ▸ Sessão                                                          ││ Fases e tarefas (2)                   │
│ criada PHASE-01                                                   ││ PHASE-01 PLANNED Fundação             │
│ ases> /task new PHASE-01 Auditar ambiente                         ││   TAR-0001 READY Auditar ambiente     │
│ criada TAR-0001                                                   ││   TAR-0002 PLANNED Monorepo           │
│ ases> /task new PHASE-01 Monorepo                                 ││                                       │
│ criada TAR-0002                                                   ││                                       │
│ ases> /task move TAR-0001 READY plano aprovado                    ││                                       │
│ TAR-0001 PLANNED → READY (versão 2)                               ││                                       │
╰───────────────────────────────────────────────────────────────────╯╰───────────────────────────────────────╯
ases> █
Enter executar · ↑↓ histórico · Tab tarefas · ? ajuda · Ctrl+L limpar · Ctrl+C×2 sair
```
- Linhas longas da sessão **quebram dentro do painel**, e o painel mostra as últimas que cabem.
- Abaixo de 100 colunas aparece um painel por vez: sessão ou tarefas, alternando com `Tab`.
- O cabeçalho atualiza por evento do engine (novo `seq`, monitor conectado ou desconectado), sem polling.

## `ases-tar` (110×13) e detalhe da tarefa
```text
⌘ Eureka42 | ASES-TAR ● LIVE  demo · seq 5
╭───────────────────────────────────────────────╮╭───────────────────────────────────────────────────────────╮
│ ▸ Fases e tarefas (2)                         ││ Eventos ao vivo                                           │
│ PHASE-01 PLANNED 0/2 · Fundação               ││ #0001 21:30:00 ProjectInitialized                         │
│ › TAR-0001 READY            Auditar ambiente  ││ #0002 21:30:00 PhaseCreated       PHASE-01 "Fundação"     │
│   TAR-0002 PLANNED          Monorepo          ││ #0003 21:30:00 TaskCreated        TAR-0001 "Auditar ambi… │
│                                               ││ #0004 21:30:00 TaskCreated        TAR-0002 "Monorepo"     │
│                                               ││ #0005 21:30:00 TaskUpdated        TAR-0001 PLANNED → REA… │
╰───────────────────────────────────────────────╯╰───────────────────────────────────────────────────────────╯
Tab painel · ↑↓ mover · Enter detalhe · r reler · ? ajuda · q sair
```
```text
╭────────────────────────────────────────────────────────────────────────────────────────────────────────────╮
│ ▸ TAR-0001 — Auditar ambiente                                                                              │
│ estado READY · versão 2 · fase PHASE-01 · prioridade 50 · risco MODERATE                                   │
│ requisitos — · depende de —                                                                                │
│ progresso: indeterminado (sem milestones verificáveis, AER-REQ-098)                                        │
│ Histórico (2 evento(s) recebidos nesta sessão)                                                             │
│ #0003 21:30:00 TaskCreated        TAR-0001 "Auditar ambiente"                                              │
│ #0005 21:30:00 TaskUpdated        TAR-0001 PLANNED → READY (plano aprovado)                                │
╰────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
```

## Terminal estreito, sem Unicode (40×10, `LANG=C`)
```text
[E42] ASES-TAR * LIVE  demo | seq 5
+--------------------------------------+
| > Fases e tarefas (2)                |
| PHASE-01 PLANNED 0/2 | Fundação      |
| > TAR-0001 READY            Auditar… |
|   TAR-0002 PLANNED          Monorepo |
|                                      |
+--------------------------------------+
Tab ver eventos | up/dn mover | Enter d…
```

## Atalhos
| `ases` | | `ases-tar` | |
|---|---|---|---|
| `Enter` | executa o comando | `Tab` | alterna painel |
| `↑ ↓` | histórico / seleção | `↑ ↓` `j k` | seleção / rolagem |
| `Tab` | prompt ↔ tarefas | `Enter` | detalhe da tarefa (busca `task.get`) |
| `?` | ajuda (prompt vazio) | `Esc` | volta |
| `Ctrl+L` | limpa a área da sessão | `r` | relê do engine (nunca reinicia execução) |
| `Ctrl+C` ×2 | sai e encerra o engine (o 1º só avisa) | `q` / `Ctrl+C` | sai |

## Acessibilidade e terminais
- O estado da conexão nunca depende só de cor: `● LIVE`, `◌ RECONNECTING`, `○ OFFLINE`, `◐ STALE` (ASCII: `* ~ - ?`).
- `NO_COLOR`, `--no-color` e saída redirecionada: nenhum código de cor. O vídeo inverso da linha selecionada continua, porque não é cor.
- Sem UTF-8 (`LANG=C`, `TERM=dumb`, ou Windows fora do Windows Terminal):
  - marca `[E42]`, bordas `+-|` e símbolos ASCII nos textos do AER (`|`, `up/dn`, `->`, `-`);
  - os acentos do português permanecem.
- Pty com 0 colunas é tratado como largura desconhecida (80).
- Resize atualiza o layout (evento `resize` do stdout).

## Limitações conhecidas
- A reticência de corte do Ink é sempre `…` (Unicode), mesmo no modo ASCII.
- O histórico da timeline e do detalhe fica em memória: 200 eventos anteriores ao snapshot + os recebidos na sessão, até 2000. Replay completo: PHASE-14.
- Filtro interativo (`/`) e busca no histórico (`Ctrl+R`) do §11.6: não implementados.
- O E2E em pty real roda em macOS (e roda em Linux via `script -qfec`, ainda **NOT_RUN**). Windows (ConPTY): **NOT_RUN**.
