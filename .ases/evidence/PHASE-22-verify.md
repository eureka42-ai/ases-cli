# PHASE-22: verificação da 1.2.1 (25/11/2026)

- **CI run 45534030860:** 8/8. Local: 428 passed. O pack-smoke deu OK.
- **Smoke real do Cursor 2026.11.22, com o consentimento do responsável:**
  1. **Sem a regra:** a escrita funcionou, mas o shell `ls` executou mesmo com `--sandbox enabled`, e ele leu uma skill fora do projeto.
  2. **Com `deny: Shell(*)` no `.cursor/cli.json`:** o shell foi recusado antes de rodar ("Command blocked by permissions configuration").
- **Fixtures sanitizadas:** `packages/provider-cursor/test/fixtures/real-cursor-2026.11.22-*.jsonl`.
- **Testes:**
  - a regra existe só durante a execução e restaura o arquivo do usuário byte a byte;
  - a tentativa barrada fica só registrada;
  - um shell que executou e o acesso fora do projeto são violações.
