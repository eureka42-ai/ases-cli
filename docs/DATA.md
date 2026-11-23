# DATA — persistência do AER

> Situação: PHASE-02. Decisões em `docs/ADRs/ADR-0002.md`. Código: `packages/persistence`.

## Arquivo e pragmas
- Banco do projeto: `.ases/db/ases.sqlite` (gitignored; o engine cria e conecta na PHASE-03).
- `foreign_keys=ON`, `busy_timeout=5000`, `journal_mode=WAL` (o modo efetivo é lido de volta e exposto em `store.info.journalMode`).
- Toda escrita passa por `BEGIN IMMEDIATE`; leitura de snapshot usa uma transação de leitura.

## Schema v1 (`PRAGMA user_version = 1`)
`projects` → `id_counters` (PHASE/TASK) → `phases` → `tasks` → `task_dependencies`, `task_requirements` → `events`.

| Tabela | Invariantes |
|---|---|
| `id_counters` | alocação de `PHASE-NN`/`TAR-NNNN` na mesma transação da criação; rollback devolve o número |
| `phases`, `tasks` | `CHECK` de estado (§5) e prioridade 0–100; `version` para CAS; FK composta `(project_id, phase_id)` |
| `task_dependencies` | PK composta, sem autodependência; só aponta para tarefas já existentes (acíclico ao criar; DAG completo na PHASE-05) |
| `task_requirements` | namespace `AER` (`AER-REQ-NNN`) ou `ASES` (`REQ-NNN`), sem renumerar |
| `events` | `seq` AUTOINCREMENT sem lacunas; `event_id UNIQUE`; `json_valid(payload_json)`; triggers bloqueiam UPDATE/DELETE |

Tabelas de attempts, leases, worktrees, approvals, providers e extensões entram nas fases que as usam.

## Regras de escrita
- Transição: `UPDATE ... WHERE version = ?` com exatamente uma linha afetada, mais o evento `TaskUpdated`/`PhaseUpdated`, na mesma transação.
- Append idempotente: o mesmo `eventId` com o mesmo payload devolve o `seq` existente; com payload diferente, `EVENT_ID_CONFLICT`.
- **Não** usar `INSERT ... ON CONFLICT DO NOTHING` / `OR IGNORE` em `events`: com AUTOINCREMENT isso consome `seq` e abre lacuna. Comportamento reproduzido em SQLite 3.50.4.

## Migrações e backup
Migrações versionadas, aplicadas em `BEGIN IMMEDIATE`, com a versão relida dentro do lock (seguro com vários processos). Se um banco existente precisa migrar, antes é feito `VACUUM INTO <arquivo>.bak-v<N>-<timestamp>`, verificado por `integrity_check` e `user_version`. Banco mais novo que o código: `DB_SCHEMA_TOO_NEW`, sem alteração.

## Espelho JSONL
`exportHistory(store, file)` reconstrói `HISTORY.jsonl` por `seq` (temp + rename). `verifyHistory(file)` acusa lacuna, duplicata, JSON inválido e hash adulterado. A falha de export não afeta transações já confirmadas: basta reexportar.

## Corte do histórico interino (PHASE-03)
O `.ases/HISTORY.jsonl` atual foi escrito por `scripts/ases-dev.mjs` e passa no `verifyHistory`. No corte para o engine:
- importar preservando `eventId` (os `seq` coincidem num banco vazio);
- não validar contra `CRITICAL_PAYLOADS`, porque o `TaskUpdated` interino usa `{from,to,evidence,note}` e não `{from,to,reason}`;
- recriar as fases e tarefas como snapshot. As transições interinas (PLANNED → REVIEW) não seguem a máquina §5.1.
