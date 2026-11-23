# Instruções para Claude Code — Projeto AER

**Leia `ASES_CLI_MD_MESTRE.md` antes de implementar**; verifique `PROMPT_INICIAL_CLAUDE_CODE.md` e os três arquivos em `fontes/`. O escopo confirmado é CLI/TUI **nos terminais de macOS, Windows e Linux (primeiro desenvolvimento no macOS)**, sem painel web. Dois comandos: `ases` e `ases-tar`.

A metodologia ASES-300 deve ser preservada; a consolidação ASES-500 exige ressalva de validação. Cada desenvolvimento requer rastreabilidade `AER-REQ-XXX` → `PHASE-XX` → `TAR-XXXX` → teste/evidência; atualize `.ases/` automaticamente, inclusive STATUS/HANDOFF/NEXT-STEPS. Use Git Worktrees e controles de segurança. Nunca invente resultados de testes, tokens disponíveis, compatibilidade de plugins ou permissões comerciais. Não instale dependências ou execute comandos arriscados sem revisão, e não modifique arquivos do usuário fora do escopo.

Prioridade imediata: PHASE-01, bootstrap real do projeto e primeira fatia vertical do motor/eventos/duas TUIs. Se o runtime não existir ainda, registre `.ases/` com scripts seguros e migre ao engine quando implementado. Ao final de cada sessão, continue de checkpoints sem depender da conversa.


**Nova decisão confirmada:** escopo multiplataforma `darwin/win32/linux` com contrato `PlatformAdapter`, UDS macOS/Linux, Named Pipes Windows, SecretStore nativo, testes reais por OS, npm com dois bins. Incluir **logo textual Eureka42**, símbolo **⌘** e quatro paletas TEAL/BLUE/PURPLE/GOLD nas TUIs `ases`/`ases-tar`, respeitando NO_COLOR/fallback ASCII. Consulte `docs/PLATAFORMAS_COMPATIBILIDADE.md`, `docs/BRANDING_EUREKA42.md` e `branding/references/` (fontes ASES devem continuar byte a byte preservadas). Especificação proposta, não alegar suporte já testado.
