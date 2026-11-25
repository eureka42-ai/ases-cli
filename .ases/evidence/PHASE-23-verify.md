# PHASE-23: verificação da 1.3.0 (25/11/2026)

- **CI run 45536704620:** 8/8. Local: 431 passed. O pack-smoke deu OK (shasum `84089593…`).
- **`/iniciar-projeto`:** Git, fontes e G0; ASES-500 guiada (24 perguntas); requisitos REQ-301+; ASES-300 (300 gerais); G1; e o GitHub privado com confirmação.
- **Testes:**
  - `onboarding.test.ts`: o fluxo inteiro com retomada, e o `gh repo create` privado por padrão, com o nome validado;
  - `tui-chat.test.tsx`: Enter vazio no modo guiado.
- **Não verificado:** a criação de um repositório real no GitHub (o `gh` está logado como eureka42-ai; nenhum repositório foi criado).
