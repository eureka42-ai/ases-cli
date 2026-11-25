# PHASE-21: verificação da 1.2.0 (25/11/2026)

- **CI run 45531979413:** 8/8. Local: 424 passed. O pack-smoke deu OK.
- **Cursor:**
  - o adaptador lê o `stream-json` no formato documentado (cursor.com/docs/cli/reference/output-format);
  - usa `--sandbox enabled` e nunca `--force`;
  - uma ferramenta de shell vira `SECURITY_VIOLATION` e interrompe o agente (`worker.test` "a provider that tries to use a shell");
  - o login é conferido por `status`, sem e-mail na evidência;
  - o modelo é escolhido por `--model` e a lista vem de `cursor-agent models`.
- **doctor na máquina do responsável:** cursor READY 2026.11.22, UNVERIFIED.
- **Não verificado:** nenhuma saída real do Cursor foi capturada (o smoke real depende do consentimento do responsável, porque gasta cota). Por isso o contrato segue UNVERIFIED.
