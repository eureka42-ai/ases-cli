# PHASE-05 — verificação (2026-11-23T01:37:02Z)

## CI real (GitHub Actions, eureka42-ai/ases-cli, run 45095195993, commit 1663719)

| alvo / Node | testes |
|---|---|
| darwin-arm64 v22.23.5 | 156 passed (156) |
| darwin-arm64 v24.22.3 | 156 passed (156) |
| win32-x64 v22.23.5 | 150 passed | 6 skipped (156) |
| win32-x64 v24.22.3 | 150 passed | 6 skipped (156) |
| win32-arm64 v22.23.5 | 150 passed | 6 skipped (156) |
| linux-x64 v22.23.5 | 156 passed (156) |
| linux-x64 v24.22.3 | 156 passed (156) |
| linux-arm64 v22.23.5 | 156 passed (156) |

Os 6 pulados no Windows: 3 E2E em pty (não existe `script` no Windows; ConPTY é a PHASE-15) e 3 só-POSIX (diretório 0700, arquivo 0600, socket órfão). Ficam **NOT_RUN** no Windows, não PASS.

## Local (darwin-arm64, Node v22.19.0)
```text
> node scripts/check-boundaries.mjs
boundaries: OK
 Test Files  28 passed (28)
      Tests  156 passed (156)
exit=0
```

## Defeitos reais encontrados e corrigidos
1. Symlink quebrado apontando para fora da worktree passava pela validação (existsSync segue o link) → lstat + readlink.
2. Motivo de espera do scheduler calculado antes das reservas (desatualizado) → recalculado depois.
3. Risco de perda de dados: banco ausente + histórico do engine recriaria o banco e sobrescreveria o histórico versionado → DB_MISSING.
4. CI Windows: core.autocrlf=true convertia LF em CRLF nos repositórios de teste (ambiente de teste, não produto).
5. CI fix 1 (run 45093981724): Ink em CI só desenha o último quadro → TUI só fora de CI; CRLF quebrava hashbang de .mjs no Windows → eol=lf; EBUSY ao apagar bancos abertos no Windows.
