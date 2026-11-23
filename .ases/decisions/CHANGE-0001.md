# CHANGE-0001 — macOS Intel (x64) fora do escopo

- **Data:** 22/11/2026 · **Status:** CONFIRMED · **Aprovador:** responsável pelo produto
- **Origem:** "Ele não rodará em MACOS intel, em todos os outros sim: windows, macos silicon e linux".

## O que mudou
| Antes | Depois |
|---|---|
| macOS arm64 **e** x64 como alvos oficiais (§0.3, §3.1, §3.7) | macOS **arm64 (Apple Silicon)** apenas |
| AER-REQ-003 "binário deve funcionar em macOS x86_64" (PROPOSED) | **N/A**: justificativa nesta CHANGE; o ID não é reutilizado |
| AER-REQ-204 "doctor identifica arm64/x86_64" | mantido: o doctor identifica a arquitetura e marca darwin-x64 como `UNSUPPORTED` |

## Impacto
- Código: `platform-core` passa a ter `SUPPORTED_TARGETS`/`assertSupportedTarget`. Os bins recusam iniciar em darwin-x64 com mensagem acionável (inclusive Node x64 sob Rosetta).
- CI: `macos-latest` (arm64) segue; nenhum runner Intel.
- Documentos: MD mestre §0.3 (nota), `docs/PLATAFORMAS_COMPATIBILIDADE.md`, `docs/PRODUCT.md`, `docs/REQUISITOS_AER.csv`, `CLAUDE.md`.
- Windows e Linux: inalterados (x64 prioritário; arm64 condicional a testes reais).
