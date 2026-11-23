# PHASE-08 — verificação parcial (2026-11-23, sessão Claude Code)

**Ambiente:** darwin-arm64, Node v22.19.0, branch `ases/PHASE-08`.

## O que rodou nos binários reais (sem prompt e sem cota)
- **Versão:** `kimi --version` dá 1.50.0; `opencode --version` dá 1.19.6.
- **Outros comandos:** `kimi info`, `--help` dos dois e `opencode providers list` (2 credenciais, só os nomes).
- **Handshake ACP** `initialize` + `session/new`, sem `session/prompt`:
  - os dois responderam `protocolVersion: 1`;
  - os dois devolveram `sessionId`;
  - os dois saíram com código 0 depois do fim do stdin (Kimi em 650 ms, OpenCode em 11 ms).
- **Gemini CLI:** não instalado.

## O que NÃO rodou
- **Nenhum `session/prompt` real:** a tentativa foi bloqueada pelo controle de permissões da sessão, porque o consentimento dado valia para Claude e Codex. A TAR-0041 fica BLOCKED até um aceite explícito para Kimi e OpenCode.
- **Contrato de Kimi, OpenCode e Google: UNVERIFIED.**

## `npm run verify`
```text
boundaries: OK
 Test Files  37 passed (37)
      Tests  226 passed (226)
```

## `ases doctor` real neste Mac
```text
  kimi       READY          1.50.0   UNVERIFIED version -> 1.50.0; auth: checked at session/new
  opencode   READY          1.19.6   UNVERIFIED version -> 1.19.6; auth: checked at session/new
  google     NOT_INSTALLED  -        UNVERIFIED gemini not found in PATH
```

## Atualização: fechamento (23/11/2026)
- **Smoke real com consentimento:** `.ases/evidence/TAR-0041-smoke-real.md`.
  - **VERIFIED:** Kimi 1.50.0, OpenCode 2.4.1 e Antigravity 1.5.13 (provider `google`).
  - **O Gemini CLI não é usado:** o login de conta Google foi encerrado para planos individuais.
- **`npm run verify` local:** 234/234.
- **CI do commit `71b8082`** (run 45232756904):
  - Linux e Windows: 6/6.
  - **macOS: NOT_RUN** (os jobs ficaram na fila, sem máquina).
- **Aprovação:** feita pelo responsável. `main` avançou por fast-forward para `a5cd051`, já com a licença CC BY-NC-ND 4.0.
