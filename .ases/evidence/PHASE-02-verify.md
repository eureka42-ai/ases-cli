# PHASE-02 — verificação (2026-11-23T00:16:51Z)

Host: macOS arm64, Node v22.19.0, SQLite 3.50.4. Branch `ases/PHASE-02` (worktree).

```text
$ npm run verify
> ases-engineering-runtime@0.0.0 verify
> npm run lint && npm run typecheck && npm run test
> ases-engineering-runtime@0.0.0 lint
> node scripts/check-boundaries.mjs
boundaries: OK
> ases-engineering-runtime@0.0.0 typecheck
> tsc -p tsconfig.json
> ases-engineering-runtime@0.0.0 test
> vitest run
 RUN  v4.1.12 <repo>
 Test Files  12 passed (12)
      Tests  64 passed (64)
   Start at  21:16:52
   Duration  683ms (transform 537ms, setup 0ms, import 958ms, tests 888ms, environment 0ms)
exit=0 (medido sem pipe)

$ npx vitest run --reporter=verbose packages/persistence packages/contracts
 ✓ packages/contracts/test/state-machine.test.ts > task state machine (AER-REQ-033) > walks the happy path 1ms
 ✓ packages/contracts/test/state-machine.test.ts > task state machine (AER-REQ-033) > rejects 20 invalid jumps 0ms
 ✓ packages/contracts/test/state-machine.test.ts > task state machine (AER-REQ-033) > any active state can block or request cancel; terminals cannot 0ms
 ✓ packages/contracts/test/state-machine.test.ts > task state machine (AER-REQ-033) > phase machine (AER-REQ-022) 0ms
 ✓ packages/contracts/test/state-machine.test.ts > canonical payload hash > is key-order independent and drops undefined 1ms
 ✓ packages/contracts/test/state-machine.test.ts > canonical payload hash > validates critical payloads strictly (AER-REQ-065) 1ms
 ✓ packages/contracts/test/contracts.test.ts > ids (AER-REQ-021, AER-REQ-031) > formats with padding and widens past the default width 1ms
 ✓ packages/contracts/test/contracts.test.ts > ids (AER-REQ-021, AER-REQ-031) > 101 phases never collide and round-trip 1ms
 ✓ packages/contracts/test/contracts.test.ts > ids (AER-REQ-021, AER-REQ-031) > rejects invalid or non-canonical ids 0ms
 ✓ packages/contracts/test/contracts.test.ts > ManifestSchema (AER-REQ-013) > accepts a valid manifest 2ms
 ✓ packages/contracts/test/contracts.test.ts > ManifestSchema (AER-REQ-013) > rejects non-relative path /Users/x/file.md 0ms
 ✓ packages/contracts/test/contracts.test.ts > ManifestSchema (AER-REQ-013) > rejects non-relative path C:\x\file.md 0ms
 ✓ packages/contracts/test/contracts.test.ts > ManifestSchema (AER-REQ-013) > rejects non-relative path \\server\share\f 0ms
 ✓ packages/contracts/test/contracts.test.ts > ManifestSchema (AER-REQ-013) > rejects non-relative path ../outside.md 0ms
 ✓ packages/contracts/test/contracts.test.ts > ManifestSchema (AER-REQ-013) > rejects unknown fields 0ms
 ✓ packages/contracts/test/contracts.test.ts > repository .ases/MANIFEST.json (AER-REQ-013, AER-REQ-151) > matches the schema and the current source checksums 3ms
 ✓ packages/persistence/test/export.test.ts > JSONL mirror (TAR-0009) > rebuilds the mirror in seq order and verifies clean (AER-REQ-067) 4ms
 ✓ packages/persistence/test/export.test.ts > JSONL mirror (TAR-0009) > detects tampering, gaps and duplicates (AER-REQ-068) 1ms
 ✓ packages/persistence/test/export.test.ts > JSONL mirror (TAR-0009) > an export failing midway leaves the previous mirror intact and no temp file (§4.3) 1ms
 ✓ packages/persistence/test/export.test.ts > JSONL mirror (TAR-0009) > verifies the interim PHASE-01 history with the same canonical hash (ADR-0002 §7) 1ms
 ✓ packages/persistence/test/store.test.ts > ids and tasks (TAR-0008, AER-REQ-031, AER-REQ-039) > allocates global TAR ids across phases 4ms
 ✓ packages/persistence/test/store.test.ts > ids and tasks (TAR-0008, AER-REQ-031, AER-REQ-039) > rejects invalid input without consuming an id 1ms
 ✓ packages/persistence/test/store.test.ts > transitions (AER-REQ-033, §6.4) > applies CAS transition with event in the same transaction 1ms
 ✓ packages/persistence/test/store.test.ts > transitions (AER-REQ-033, §6.4) > rejects stale version, illegal jump and unknown task without writing anything 0ms
 ✓ packages/persistence/test/store.test.ts > transitions (AER-REQ-033, §6.4) > phase cannot complete with open tasks (AER-REQ-024) 2ms
 ✓ packages/persistence/test/store.test.ts > event store (TAR-0007) > is idempotent by eventId and rejects a reused id with another payload (AER-REQ-064) 0ms
 ✓ packages/persistence/test/store.test.ts > event store (TAR-0007) > validates critical payloads before writing (AER-REQ-065) 1ms
 ✓ packages/persistence/test/store.test.ts > event store (TAR-0007) > keeps events append-only at the database level (AER-REQ-061) 0ms
 ✓ packages/persistence/test/store.test.ts > event store (TAR-0007) > pages by seq without gaps (AER-REQ-069) 5ms
 ✓ packages/persistence/test/store.test.ts > event store (TAR-0007) > snapshot returns a seq cursor consistent with its rows (AER-REQ-074) 0ms
 ✓ packages/persistence/test/store.test.ts > event store (TAR-0007) > rolls back state and events together when the transaction throws 0ms
 ✓ packages/persistence/test/migrations.test.ts > migrations (TAR-0006) > applies on an empty file with WAL and FKs on 4ms
 ✓ packages/persistence/test/migrations.test.ts > migrations (TAR-0006) > reopening is idempotent (no backup, same version) 1ms
 ✓ packages/persistence/test/migrations.test.ts > migrations (TAR-0006) > backs up and verifies before migrating an existing database (AER-REQ-018) 5ms
 ✓ packages/persistence/test/migrations.test.ts > migrations (TAR-0006) > refuses a database newer than the code (AER-REQ-010, C18) 1ms
 ✓ packages/persistence/test/migrations.test.ts > migrations (TAR-0006) > rolls back a failing migration and leaves the version untouched 7ms
 ✓ packages/persistence/test/migrations.test.ts > migrations (TAR-0006) > enforces CHECK constraints on states and priority 1ms
 ✓ packages/persistence/test/multiprocess.test.ts > multi-process transactions (TAR-0010, AER-REQ-191) > 8 concurrent processes append 400 events with contiguous seq and no loss (AER-REQ-062) 227ms
 ✓ packages/persistence/test/multiprocess.test.ts > multi-process transactions (TAR-0010, AER-REQ-191) > a transition race between 10 processes has exactly one winner (AER-REQ-045) 176ms
 ✓ packages/persistence/test/multiprocess.test.ts > multi-process transactions (TAR-0010, AER-REQ-191) > process death before COMMIT leaves neither state nor event (AER-REQ-063) 91ms
      Tests  40 passed (40)

$ 3x npx vitest run packages/persistence/test/multiprocess.test.ts
      Tests  3 passed (3)
      Tests  3 passed (3)
      Tests  3 passed (3)
```

## Defeito encontrado e corrigido durante a fase
Lacuna de `seq` causada por `INSERT ... ON CONFLICT DO NOTHING` com AUTOINCREMENT (append repetido do mesmo eventId). Reproduzido isoladamente (seq 1, 3) e corrigido com SELECT prévio sob `BEGIN IMMEDIATE`. O teste de paginação detectou o problema.

## Não executado
- Windows e Linux reais (AER-REQ-236): NOT_RUN. A suíte multiprocesso é o gate de reavaliação do driver (ADR-0002).
