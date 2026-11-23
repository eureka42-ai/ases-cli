# Instruções de colaboração portáveis — AER

Implementar conforme `ASES_CLI_MD_MESTRE.md`. Destino multiplataforma: macOS, Windows, Linux; primeira implementação/testes locais no macOS; `ases` para controle e `ases-tar` para monitor. Fontes normativas ASES preservadas em `fontes/`. Requisitos próprios `AER-REQ-XXX` em `docs/REQUISITOS_AER.csv`; não renumerar os `REQ-001..REQ-300` gerais.

Para cada tarefa `TAR-XXXX`: verificar dependências, registrar attempt, editar apenas worktree autorizada, testar, emitir eventos e evidências, revisar e atualizar handoff/checkpoint. Nunca declarar funcionalidade pronta sem prova. Credenciais sob fluxos oficiais, extensão com inspeção e autenticação delegada; não usar assinatura de IA por métodos não autorizados. `ases-tar` deve permanecer readonly. Em qualquer bloqueio, registrar estado, causa e próxima operação segura.


Identidade obrigatória do produto: Eureka42 — símbolo ⌘, fontes de referência Noto Sans Symbols 2 / Inter / Montserrat ExtraBold, temas teal/blue/purple/gold e fallback ASCII nas duas TUIs. `PlatformAdapter` isola IPC, secrets, caminhos, processos e supervisor por sistema. Sem painel web. Nunca prometer suporte a SO ou temas sem testes; atualizar `.ases/` e requisitos 225..250.
