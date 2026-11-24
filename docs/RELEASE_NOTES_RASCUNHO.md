# Notas de versão: RASCUNHO do primeiro release (TAR-0075)

**Estado:** rascunho, **não publicado**. Ainda faltam três decisões do responsável:
1. o número da versão (hoje `0.0.0`);
2. publicar ou não no registro npm, e com qual conta/escopo (`@eureka42/aer`);
3. aceitar a cobertura atual do macOS (só local) ou esperar um run de CI com macOS.

O tarball sai de `node scripts/pack.mjs` e é autocontido: instala sem rede.

## O que vem nesta versão
- **Dois comandos:** `ases` (TUI e comandos) e `ases-tar` (monitor somente leitura, ao vivo, por IPC local; sem servidor de rede).
- **Motor local:** event store SQLite com migrações e backup; tarefas com leases e fencing; worktree Git por tentativa; checkpoints; motor residente (`ases daemon`).
- **Providers** (consentimento por run, `/run --consent`; o AER nunca faz login):

  | Provider | Status | Versão verificada |
  |---|---|---|
  | Claude Code | VERIFIED | 2.1.330 |
  | Codex | VERIFIED | 0.170.0 |
  | Kimi | VERIFIED | 1.50.0 |
  | OpenCode | VERIFIED | 2.4.1 |
  | Google, via Antigravity CLI | VERIFIED | 1.5.13 |

  O simulador serve para testar tudo sem conta.
- **Metodologia ASES-300/500:** os 300 requisitos literais, entrevista por trilhas, decisões, CHANGE e gates G0/G1. O ASES-500 sai com o selo "PARA VALIDAÇÃO".
- **Segurança:**
  - políticas deny-by-default, com aprovações ligadas ao hash da operação;
  - registry de extensões com inspeção e compatibilidade por provider;
  - redação de segredos;
  - SecretStore nativo: Keychain no macOS, Credential Manager no Windows, Secret Service no Linux.
- **Continuidade:** handoff entre providers sem perder arquivos; `/test` real; `/review` independente; `/resume`; `/usage` por provider; `/diff` só leitura.
- **Marca Eureka42:**
  - logo em 4 modos;
  - temas teal/blue/purple/gold/mono/contrast/auto, com cor em 24/8/4 bits;
  - precedência CLI > projeto > global;
  - `NO_COLOR` e `--json` limpos.

## Plataformas
A matriz por alvo está em `docs/MATRIZ_SUPORTE.md`, gerada dos jobs reais do CI.

| Alvo | Situação |
|---|---|
| Windows x64, Linux x64 | PASS no CI (Node 22 e 24), incluindo o pacote instalado e os shells |
| macOS Apple Silicon | Verificado localmente a cada fase. Os jobs de macOS do CI ficaram na fila e foram cancelados (NOT_RUN); o último 8/8 foi o run 45304163008 |
| Windows arm64, Linux arm64 | PASS no CI, mas **CONDITIONAL**: não anunciados como suportados |
| macOS Intel | Fora do escopo (CHANGE-0001) |

## Limitações conhecidas
- **TUI no Windows Terminal/ConPTY:** NOT_RUN. O modo linha funciona; o roteiro manual está em `docs/SUPORTE_TERMINAIS_WINDOWS.md` (TAR-0070).
- **Sem supervisor do SO:** reboot ou queda do motor exigem `/resume` (ADR-0017).
- **Exceções P0 aprovadas para depois desta versão** (`docs/AUDITORIA_P0.md`): 020, 025, 026, 029, 049, 082, 083, 086, 128, 174, 230 (SMB remoto) e 234.
- **Uso de tokens:** sem dados de uso para os providers ACP; só o que cada cliente reporta é mostrado.
- **Constrained Language Mode no Windows:** o AER falha fechado (ADR-0018).

## Licença
- **AER:** CC BY-NC-ND 4.0.
- **Terceiros embutidos:** 41 pacotes MIT/ISC/CC0, com os avisos em `THIRD_PARTY_LICENSES.md` dentro do pacote.
