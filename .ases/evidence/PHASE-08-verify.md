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
