# PHASE-27: verificação da 1.7.0 (27/11/2026)

- **CI run 45933653887:** 8/8. Local: 483 passed.
- **Cadeia de integridade:** `verify-state.test.ts` (elo novo a cada evento, backfill de banco antigo, evento reescrito detectado, ponto fixado divergente). Também `chat-commands.test.ts`.
- **Problemas:**
  - `issues.test.ts`;
  - `chat-run.test.ts` (bloqueio vira problema);
  - `chat.test.ts` (principal vê os abertos);
  - `chat-commands.test.ts` (`/problema corrigir` gera plano da principal).
- **Exportação ESAA:** `esaa-export.test.ts`, com cada evento conferido contra o `event.schema.json` oficial do ESAA (fixture MIT) e as regras de projeção todo → in_progress → review → done.
- **Cópia do banco real do AER:** `/verificar` OK (944 eventos, cadeia montada para o histórico antigo); `/exportar-esaa` gerou 354 eventos.
- **Não verificado:** o `esaa verify` do próprio ESAA sobre o arquivo exportado (o esaa-core não foi instalado).
