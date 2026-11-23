# PHASE-07 — verificação parcial (2026-11-23, sessão Claude Code)

**Ambiente:** darwin-arm64, Node v22.19.0, branch `ases/PHASE-07`. Claude Code 2.1.330 instalado e logado (claude.ai, Pro). Codex 0.170.0 instalado e logado (ChatGPT).

## Nenhuma chamada real a provider foi feita
O responsável ainda não deu consentimento para consumir cota (AER-REQ-123). Por isso:
- **Foram executados nos binários reais apenas:** `--version`, `--help`, `claude auth status`, `codex login status` e `ases doctor`.
- **Todos os testes de adapter usam falsos binários** (`packages/provider-*/test/fixtures/fake-*.mjs`) com o formato **documentado** (`doc-derived-*.jsonl`), não com captura real.
- **Contrato dos dois adapters: UNVERIFIED.**

## `npm run verify`
```text
boundaries: OK
 Test Files  36 passed (36)
      Tests  211 passed (211)
```
A suíte completa foi repetida mais 2 vezes, com 211/211 nas duas. Nenhum processo de teste ficou vivo.

## `ases doctor` real neste Mac
```text
providers:
  simulator  READY      1.0.0    SIMULATED
  claude     READY      2.1.330  UNVERIFIED  auth status -> loggedIn=true method=claude.ai
  codex      READY      0.170.0  UNVERIFIED  login status -> exit 0, loggedIn=true, method=ChatGPT
```

## Defeitos reais encontrados
1. O probe do Codex dava `NOT_AUTHENTICATED` com a conta logada: `codex login status` escreve no **stderr**. Corrigido (o `runShort` lê os dois streams) e reproduzido no falso binário.
2. O worker sondava o provider antes de checar o consentimento: sem aceite, o probe rodava mesmo assim, e o motivo do bloqueio dependia da máquina. Agora `requiresConsent` é verificado antes de qualquer processo.

## Testes novos
| Tarefa | Arquivo | O que prova |
|---|---|---|
| TAR-0033 | `packages/provider-claude/test/claude.test.ts` (11) | flags documentadas e nenhuma perigosa; mapeamento; conteúdo de arquivo não vaza; estados de probe; credencial alheia não chega; auth ≠ rate limit; sem `result` não há sucesso; timeout |
| TAR-0034 | `packages/provider-codex/test/codex.test.ts` (7) | o mesmo para o Codex |
| TAR-0036 | `test/e2e/providers.test.mjs` (2), `packages/scheduler/test/worker.test.ts` (+3) | CLIs ausentes não escondem o simulador; tarefa `claude` sem `--consent` fica BLOCKED sem nenhum processo; com aceite chega a REVIEW como UNVERIFIED; 1 por provider |

## Pendente
- **TAR-0035 (smoke real): BLOCKED**, aguardando consentimento explícito do responsável.
- **CI:** ainda não rodou para estes commits.
