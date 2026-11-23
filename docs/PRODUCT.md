# PRODUCT — Eureka42 · ASES Engineering Runtime (AER)

> Resumo operacional. A fonte de autoridade é `ASES_CLI_MD_MESTRE.md` (§0.3, §1, §2). Estados: CONFIRMED / PROPOSED / PENDING.

## Problema
Quem usa vários CLIs de IA (Claude Code, Codex, Kimi, OpenCode, Google) perde contexto entre sessões, executa trabalho em paralelo sem isolamento e não consegue provar o que cada agente fez de verdade (§1.2).

## Usuários
Engenheiro individual, líder técnico, colaborador externo e auditor (§1.5).

## Escopo confirmado (CONFIRMED)
- CLI/TUI local em **macOS Apple Silicon (arm64), Windows e Linux**; macOS Intel fora do escopo (CHANGE-0001); **sem painel web**, Electron ou servidor público.
- Dois bins no mesmo pacote npm: `ases` (controle e orquestração) e `ases-tar` (monitor somente leitura).
- `.ases/` por projeto, com `PHASE-XX`, `TAR-XXXX` globais, eventos, checkpoints, `HANDOFF.md` e `NEXT-STEPS.md`.
- Providers apenas por clientes ou APIs oficiais e autorizados; nunca captura de tokens.
- Metodologia ASES-300 (normativa) e ASES-500 consolidado (**para validação**).
- Identidade textual Eureka42: `⌘`, temas TEAL/BLUE/PURPLE/GOLD, `NO_COLOR` e fallback ASCII.
- Gerenciador de pacotes: npm workspaces (ADR-0001).

## Fora de escopo (§1.4)
Web/PWA/Electron, pool de cotas entre assinaturas, reutilização de credenciais, execução irreversível sem aprovação, cluster/SaaS.

## Situação atual (22/11/2026, PHASE-03)
- Existem `ases` (engine embutido + sessão em modo linha + `init`/`doctor`) e `ases-tar` (monitor somente leitura em texto/JSONL), comunicando por IPC local.
- Sem TUI Ink ainda (PHASE-04) e sem providers de IA (PHASE-07): texto livre no `ases` responde que o chat não está implementado e nada é enviado.
- Matriz de SO: macOS arm64 testado localmente (unit, integração, E2E com processos reais); Windows e Linux **NOT_RUN**.

## Pendências
- Licença (bloqueia publicação, AER-REQ-210).
- Driver SQLite (ADR-0002).
