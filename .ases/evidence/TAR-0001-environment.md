# TAR-0001 — Auditoria de ambiente (read-only)

Data UTC: 2026-11-23T00:08:12Z. Nada foi instalado durante a auditoria.

```text
os: macOS 27.2.1 (26B131), kernel 27.2.0
node: v22.19.0 platform=darwin arch=arm64
npm: 10.9.3
pnpm: NOT_FOUND
corepack: 0.34.0
git: git version 2.50.1
claude: 2.1.330 (Claude Code)
codex: codex-cli 0.170.0
kimi: kimi, version 1.50.0
opencode: 1.19.6
gemini: NOT_FOUND
node:sqlite: disponível (ExperimentalWarning no Node 22)
```

## Matriz de SO

| Alvo | Estado |
|---|---|
| macOS arm64 (este host) | unit/integração PASS; bins ainda não existem |
| macOS x64 | NOT_RUN |
| Windows x64/arm64 | NOT_RUN |
| Linux x64/arm64 | NOT_RUN |

CLIs de provider foram apenas detectados (`--version`), sem login, sem prompt e sem chamada tarifável. AER-REQ-002/003 (bins) seguem pendentes até a PHASE-03.
