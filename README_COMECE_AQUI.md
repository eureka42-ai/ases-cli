# ASES Engineering Runtime (AER) — Kit multiplataforma e branding Eureka42 — início no Claude Code

**Data:** 22/11/2026  
**Situação:** projeto especificado; código-fonte do AER ainda não construído por este kit.

## Conteúdo

- `ASES_CLI_MD_MESTRE.md`: documento mestre ultraespecificado, arquitetura, funcionalidades, riscos, execução por fases, interfaces e catálogo completo.
- `PROMPT_INICIAL_CLAUDE_CODE.md`: prompt direto para Claude Code iniciar a codificação, sem repetir perguntas já respondidas.
- `CLAUDE.md`: instruções resumidas para carregamento no Claude Code.
- `AGENTS.md`: diretrizes portáteis para outros agentes.
- `docs/REQUISITOS_AER.md`: catálogo de 250 requisitos específicos do CLI, com critérios de aceite.
- `docs/REQUISITOS_AER.csv`: versão estruturada do mesmo catálogo, com estado PROPOSED.
- `fontes/ASES-300_DOCUMENTACAO_INTEGRAL.md`: fonte de trabalho contendo o núcleo geral ASES-300, inclusive REQ-001..REQ-300.
- `fontes/ASES-500_METODOLOGIA_CONSOLIDADA_PARA_VALIDACAO.md`: reconstrução/consolidação para validação; **não** fonte original homologada.
- `fontes/ASES-500_GPT_ESPECIFICADOR_INTERATIVO_TRABALHO.md`: prompt operacional derivado, não homologação do método independente.
- `docs/PLATAFORMAS_COMPATIBILIDADE.md`: contrato de portabilidade, IPC, segredos e testes dos três sistemas.
- `docs/BRANDING_EUREKA42.md`: identidade visual de terminal com símbolo ⌘, fontes de referência e quatro temas.
- `branding/LOGO_TERMINAL.txt` e `branding/BRAND_TOKENS.json`: representações textuais e tokens propostos.
- `branding/references/*.png`: imagens originais de referência da marca Eureka42, sem distribuição de arquivos de fonte.
- `MANIFESTO_FONTES_SHA256.txt`: hashes das referências ASES, protegendo a proveniência dos arquivos.

## Como começar (primeiro desenvolvimento no macOS; produto para macOS, Windows e Linux)

1. Crie uma pasta vazia para o projeto, por exemplo `~/Projetos/ases-engineering-runtime`.
2. Extraia o ZIP **dentro da pasta do novo projeto**, preservando subpastas `fontes/` e `docs/`.
3. Abra o Terminal e navegue até a pasta do projeto:

   ```bash
   cd ~/Projetos/ases-engineering-runtime
   git init
   claude
   ```

4. Na primeira mensagem do Claude Code, cole o conteúdo de `PROMPT_INICIAL_CLAUDE_CODE.md` ou escreva: **"Leia o PROMPT_INICIAL_CLAUDE_CODE.md e o MD mestre. Comece a PHASE-01 conforme instruções."**
5. O Claude Code deverá detectar a instalação de Node/pnpm/Git, verificar fontes, inicializar `.ases/` e iniciar o monorepo, criando tarefas rastreáveis. Instalações, gastos com APIs, uso de credenciais e operações arriscadas precisam de consentimento.
6. Ao terminar cada sessão, confira `.ases/STATUS.md`, `.ases/NEXT-STEPS.md` e `.ases/HANDOFF.md`; eles permitem retomar com outro modelo.

## Como será depois de implementado

Na primeira janela de Terminal, `cd meu-projeto && ases`; na segunda, `cd meu-projeto && ases-tar`. **Esses comandos são a meta do projeto, não executáveis já presentes neste kit.**

## Restrições essenciais

**Somente CLI/TUI nos terminais de macOS, Windows e Linux. Sem painel web.** Autenticação apenas por clientes oficiais ou APIs autorizadas. Cotas de assinatura não são um pool de tokens. Plugins e Skills do Claude só são compartilhados quando compatibilidade e autorização forem verificadas. Todo trabalho mantém históricos `.ases/`, IDs PHASE/TAR, checkpoints e evidências reais.

## Orientação específica de release multiplataforma

A implementação começa no macOS, porém a divisão `platform-core/platform-macos/platform-windows/platform-linux` deve existir desde o início. Não publicar a versão estável como multiplataforma até comprovar o uso real de `ases`, `ases-tar`, IPC e npm em macOS, Windows e Linux. Distribuir pacote npm único com ambos executáveis. A marca textual Eureka42 aparece nas duas TUIs, com quatro temas e fallback ASCII; fontes externas não são instaladas.
