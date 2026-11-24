# AER 1.0.0: notas de versão (TAR-0075, 24/11/2026)

**Instalar:** `npm install -g @eureka42-ai/aer`, publicado pela conta npm `eureka42-ai`. O mesmo pacote existe como `.tgz` autocontido, gerado por `node scripts/pack.mjs`, que instala sem rede.

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
| Windows x64, Linux x64 | PASS no CI (Node 22 e 24), incluindo o pacote instalado, os shells e, no Windows, a TUI num ConPTY real |
| Windows arm64, Linux arm64 | PASS no CI, **suportados** desde esta versão |
| macOS Apple Silicon | Verificado na máquina do responsável (decisão de 24/11/2026). Os jobs de macOS do CI foram cancelados na fila (NOT_RUN); o último 8/8 no CI foi o run 45304163008 |
| macOS Intel | Fora do escopo (CHANGE-0001) |

## Limitações conhecidas
- **TUI no Windows:** coberta no ConPTY/Windows Terminal (CI). O conhost antigo e o PowerShell 5.1 como host só têm o roteiro manual (`docs/SUPORTE_TERMINAIS_WINDOWS.md`).
- **Sem supervisor do SO:** reboot ou queda do motor exigem `/resume` (ADR-0017).
- **Exceções P0 aprovadas para depois desta versão** (`docs/AUDITORIA_P0.md`): 020, 025, 026, 029, 049, 082, 083, 086, 128, 174, e 230 (SMB remoto).
- **Uso de tokens:** sem dados de uso para os providers ACP; só o que cada cliente reporta é mostrado.
- **Constrained Language Mode no Windows:** o AER falha fechado (ADR-0018).

## Licença
- **AER:** CC BY-NC-ND 4.0.
- **Terceiros embutidos:** 41 pacotes MIT/ISC/CC0, com os avisos em `THIRD_PARTY_LICENSES.md` dentro do pacote.
