# CHANGE-0002 — renomear a imagem do estudo de marca (Windows)

- **Data:** 22/11/2026 · **Status:** CONFIRMED (autorização ampla do responsável para melhorar o projeto)
- **Motivo:** `branding/references/Estudo de Marca Eureka42: Quatro Variações.png` contém `:`, caractere proibido em nomes de arquivo no Windows. O checkout do repositório falharia num alvo oficial.
- **Mudança:** `git mv` para `Estudo de Marca Eureka42 - Quatro Variações.png`. **Bytes idênticos:** SHA-256 `4f01e8d7…c8c3d` conferido após a mudança. Manifestos e referências atualizados (MD mestre §11.7, BRANDING, ADR-0001, `.ases/MANIFEST.json`, `scripts/aer-plan.json`, `branding/MANIFESTO_IMAGENS_SHA256.txt`).
- **Não alterado:** `.ases/evidence/PHASE-01-verify.md`, que é registro histórico com o nome da época.
