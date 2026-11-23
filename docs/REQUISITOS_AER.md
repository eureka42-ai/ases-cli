# Catálogo de Requisitos Específicos AER

> 250 requisitos propostos e verificáveis, sem alteração dos requisitos gerais ASES-300 (`REQ-001..300`).
> Status inicial: PROPOSED. Os testes `T-AER-XXX` são IDs planejados, não evidências executadas.
> Os `AER-REQ-001..224` foram preservados em seus IDs; `225..250` adicionam portabilidade e branding Eureka42.

| ID | Domínio | Prioridade | Obrigação | Critério de aceite |
|---|---|---|---|---|
| AER-REQ-001 | FOUNDATION / INSTALAÇÃO | P0 | O produto deve operar nos terminais nativos de macOS Windows e Linux sem serviço remoto de coordenação | Smoke local por OS com estados PASS/NOT_RUN |
| AER-REQ-002 | FOUNDATION / INSTALAÇÃO | P0 | O binário deve funcionar em macOS arm64 suportado | Smoke `ases --help` e `ases-tar --help` em arm64 |
| AER-REQ-003 | FOUNDATION / INSTALAÇÃO | P0 | O binário deve funcionar em macOS x86_64 suportado | Smoke equivalente em host x86_64; se não executado marcar NOT_RUN |
| AER-REQ-004 | FOUNDATION / INSTALAÇÃO | P0 | O mesmo pacote deve fornecer os comandos `ases` e `ases-tar` | `which` identifica ambos após instalação local |
| AER-REQ-005 | FOUNDATION / INSTALAÇÃO | P0 | Versão Node suportada deve constar em engines e CI | Build rejeita versão abaixo do limite documentado |
| AER-REQ-006 | FOUNDATION / INSTALAÇÃO | P0 | Dependências entre pacotes devem respeitar direção de imports | Teste de dependências rejeita import de UI em core |
| AER-REQ-007 | FOUNDATION / INSTALAÇÃO | P0 | Código TS principal deve compilar com strict e verificações extras | `pnpm typecheck` passa sem ignorar erros |
| AER-REQ-008 | FOUNDATION / INSTALAÇÃO | P0 | O usuário deve conseguir desinstalar o AER sem excluir projetos | Teste install/uninstall preserva `.ases/` do projeto |
| AER-REQ-009 | FOUNDATION / INSTALAÇÃO | P0 | AER não deve iniciar servidor HTTP público nem exigir navegador para operação principal | Scan de portas e E2E CLI sem navegador |
| AER-REQ-010 | FOUNDATION / INSTALAÇÃO | P0 | App, schema SQLite, `.ases/` e IPC devem ter versões independentes | Teste de incompatibilidade apresenta erro controlado |
| AER-REQ-011 | PROJECT | P0 | `ases init` deve criar `.ases/` sem apagar conteúdo preexistente | Rodar duas vezes e comparar hashes dos arquivos |
| AER-REQ-012 | PROJECT | P0 | AER deve localizar e validar a raiz do projeto e a raiz Git | Teste em subdiretório e symlink |
| AER-REQ-013 | PROJECT | P0 | Cada projeto deve possuir MANIFEST.json schema-validado e versão | Teste valida schema e checksums |
| AER-REQ-014 | PROJECT | P0 | Diretórios privados devem ter owner e permissões restritivas nativas por plataforma | Teste POSIX stat (macOS/Linux) e Windows DACL para state/IPC |
| AER-REQ-015 | PROJECT | P0 | CONFIG.json deve referenciar secrets por ID sem conter valores | Scanner não localiza chave fixture |
| AER-REQ-016 | PROJECT | P0 | Arquivos Markdown e JSON essenciais devem funcionar sem o AER instalado | Abrir export e reconstruir checklist manual |
| AER-REQ-017 | PROJECT | P0 | Init deve respeitar arquivos Git, package e docs existentes | Fixture com repo sujo permanece íntegra |
| AER-REQ-018 | PROJECT | P0 | Migração deve fazer backup antes de modificar estrutura existente | Inject crash, verificar backup e reparo |
| AER-REQ-019 | PROJECT | P0 | Identificadores de projeto não devem mudar pela renomeação da pasta | Mover projeto e validar ID |
| AER-REQ-020 | PROJECT | P0 | Config global, projeto e execução devem seguir precedência documentada | Teste três níveis e valor final esperado |
| AER-REQ-021 | PHASES | P0 | Fases devem ter IDs PHASE-01 e sequenciamento monotônico | Criar 101 fases sem colisão |
| AER-REQ-022 | PHASES | P0 | Estados de fase devem seguir máquina validada | Transição ilegal rejeitada |
| AER-REQ-023 | PHASES | P0 | PHASE.md deve conter escopo, metas, critérios e dependências | Validador de template identifica ausência |
| AER-REQ-024 | PHASES | P0 | Fase não conclui com tarefa obrigatória pendente | Teste de bloqueio com uma task FAILED |
| AER-REQ-025 | PHASES | P0 | Fase bloqueada deve explicitar motivo e task dependente | Monitor exibe razão do bloqueio |
| AER-REQ-026 | PHASES | P0 | Novo plano deve gerar evento e arquivo consistente | Verificar seq + arquivo após criação |
| AER-REQ-027 | PHASES | P0 | Fases podem ser ordenadas sem renumerar IDs históricos | Teste reordenação preserva ID |
| AER-REQ-028 | PHASES | P0 | Fases devem referenciar requisitos relevantes | Traceability report mostra IDs ligados |
| AER-REQ-029 | PHASES | P0 | Mudança de fase não pode alterar tasks aprovadas sem registro | Gerar CHANGE e diff de plano |
| AER-REQ-030 | PHASES | P0 | Concluir fase produz relatório de evidências e decisões | Relatório apresenta testes reais e exceções |
| AER-REQ-031 | TASKS | P0 | IDs TAR-0001+ devem ser globais ao projeto e imutáveis | Criar em 2 fases e verificar unicidade |
| AER-REQ-032 | TASKS | P0 | TASK.md deve registrar objetivo, escopo, critérios e dependências | Schema/validator rejeita campos essenciais ausentes |
| AER-REQ-033 | TASKS | P0 | Transições devem passar por máquina de estados | Testes de 20 saltos inválidos |
| AER-REQ-034 | TASKS | P0 | Nova tentativa não deve sobrescrever histórico anterior | ATT-0001 e ATT-0002 permanecem |
| AER-REQ-035 | TASKS | P0 | Task deve indicar provider responsável por attempt | Task detail exibe provider e versão |
| AER-REQ-036 | TASKS | P0 | Cada task deve ter histórico cronológico exportado | HISTORY.jsonl reconstitui eventos |
| AER-REQ-037 | TASKS | P0 | Task sem pré-condição fica BLOCKED com justificativa | Scheduler não inicia task bloqueada |
| AER-REQ-038 | TASKS | P0 | Task concluída só reabre por mudança explícita com auditoria | CHANGE e nova attempt registrados |
| AER-REQ-039 | TASKS | P0 | Prioridade deve ser normalizada e validar intervalo | Entrada fora de 0-100 falha |
| AER-REQ-040 | TASKS | P0 | Cancelamento deve reconciliar processo e worktree | TASK CANCELLED somente após confirmação/recovery |
| AER-REQ-041 | DAG / SCHEDULER | P0 | Dependências devem formar grafo acíclico | Teste A→B→C→A rejeitado com caminho |
| AER-REQ-042 | DAG / SCHEDULER | P0 | Task dependente inicia somente quando condição formal for atendida | Teste paralelo mantém bloqueio |
| AER-REQ-043 | DAG / SCHEDULER | P0 | Scheduler deve respeitar max_parallel_tasks | Com limite 2 nunca há 3 RUNNING |
| AER-REQ-044 | DAG / SCHEDULER | P0 | Scheduler deve respeitar limites por provider | Simulador com limite 1 não duplica |
| AER-REQ-045 | DAG / SCHEDULER | P0 | Task não pode ser reservada por dois schedulers simultâneos | Corrida de 20 processos produz um vencedor |
| AER-REQ-046 | DAG / SCHEDULER | P0 | Owner vencido não deve publicar evento de conclusão tardio | Teste lease vencido rejeita old token |
| AER-REQ-047 | DAG / SCHEDULER | P0 | Processos ativos devem renovar leases observáveis | Monitor exibe timestamp válido |
| AER-REQ-048 | DAG / SCHEDULER | P0 | Rate limit deve adiar novas tentativas do provider | 429 de fixture cria cooldown sem loop |
| AER-REQ-049 | DAG / SCHEDULER | P0 | Retry deve respeitar max attempts e backoff | Fixture 10 erros para após limite |
| AER-REQ-050 | DAG / SCHEDULER | P0 | Decisão automática deve ter rationale persistido | Evento registra critérios e alternativas |
| AER-REQ-051 | GIT | P0 | Task que escreve deve ter worktree isolada | Duas tasks alteram arquivos separados sem colidir |
| AER-REQ-052 | GIT | P0 | Branches devem identificar TAR e ATT | Nome aparece no manifest de tentativa |
| AER-REQ-053 | GIT | P0 | Toda tentativa deve registrar base commit | Git rev-parse compara com registro |
| AER-REQ-054 | GIT | P0 | Escrita em checkout principal exige aprovação distinta | Provider fake tenta alteração e é bloqueado |
| AER-REQ-055 | GIT | P0 | AER não deve sobrescrever alterações humanas não commitadas | E2E dirty tree conserva bytes |
| AER-REQ-056 | GIT | P0 | Merges no branch-alvo devem ser serializados | Dois merges não ocorrem simultaneamente |
| AER-REQ-057 | GIT | P0 | Conflito não deve ser auto-descartado | Fixture conflitante termina em CONFLICT |
| AER-REQ-058 | GIT | P0 | Checkpoint deve criar refs e metadados verificáveis | Checkout em nova worktree reproduz commit |
| AER-REQ-059 | GIT | P0 | AER não deve executar hard reset/force push sem aprovação | Policy intercepta comando |
| AER-REQ-060 | GIT | P0 | Escrita fora do worktree via symlink deve ser bloqueada | Teste link para /tmp ou diretório externo |
| AER-REQ-061 | EVENTS | P0 | Eventos devem ser acrescentados sem UPDATE de payload histórico | Teste DB rejeita mutation não autorizada |
| AER-REQ-062 | EVENTS | P0 | Eventos por projeto devem ter ordem consistente | Paralelismo não duplica seq |
| AER-REQ-063 | EVENTS | P0 | Mudança de task e evento devem confirmar atomicamente | Crash before commit deixa ambos intactos |
| AER-REQ-064 | EVENTS | P0 | eventId deve evitar dupla inserção em retry | Repetir eventId altera zero linhas |
| AER-REQ-065 | EVENTS | P0 | Eventos críticos devem passar schema Zod | Campo inválido gera erro |
| AER-REQ-066 | EVENTS | P0 | Logs não devem revelar API keys e passwords | Fixture vazamento não aparece na exportação |
| AER-REQ-067 | EVENTS | P0 | Espelho deve ser derivado por seq do banco | Rebuild produz ordem idêntica |
| AER-REQ-068 | EVENTS | P0 | Tampering em export deve ser detectado por hash/seq | Alterar linha gera alerta |
| AER-REQ-069 | EVENTS | P0 | Histórico extenso deve ser lido em páginas | 10k eventos sem carregar tudo na UI |
| AER-REQ-070 | EVENTS | P0 | Monitor deve buscar eventos perdidos depois de desconectar | Gap recuperado sem duplicidade |
| AER-REQ-071 | IPC | P0 | Comunicação entre processos deve usar UDS privado | Netstat não mostra listener público do motor |
| AER-REQ-072 | IPC | P0 | Handshake deve rejeitar versão incompatível | Cliente antigo recebe VERSION_MISMATCH |
| AER-REQ-073 | IPC | P0 | Cliente não autorizado não deve mutar nem ler dados sensíveis | Teste com socket injetado rejeitado |
| AER-REQ-074 | IPC | P0 | Snapshot deve carregar cursor seq correspondente | Reprodução não perde evento durante snapshot |
| AER-REQ-075 | IPC | P0 | Monitor deve assinar stream a partir de fromSeq | Evento enviado aparece 1 vez |
| AER-REQ-076 | IPC | P0 | Queda de socket deve mostrar RECONNECTING e tentar resync | Reiniciar motor durante live stream |
| AER-REQ-077 | IPC | P0 | Cliente lento não deve travar scheduler | 10k eventos e consumidor lento preservam motor |
| AER-REQ-078 | IPC | P0 | Mensagens acima do limite devem ser negadas | Fuzz com frames gigantes |
| AER-REQ-079 | IPC | P0 | ases-tar não deve possuir RPC mutante utilizável | RPC mutante via token do monitor é negado |
| AER-REQ-080 | IPC | P0 | Cada operação IPC deve ter timeout e erro tipado | Servidor mudo não trava TUI indefinidamente |
| AER-REQ-081 | TUI ASES | P0 | `ases` deve permitir digitar instruções em um único prompt | Teste TUI render e input |
| AER-REQ-082 | TUI ASES | P0 | Usuário deve poder selecionar provider por comando | /agent codex reflete seleção |
| AER-REQ-083 | TUI ASES | P0 | Usuário deve alternar auto/manual/hybrid por comando | Status exibe modo correto |
| AER-REQ-084 | TUI ASES | P0 | Usuário deve listar fases sem sair da TUI | /phases apresenta dados SQLite |
| AER-REQ-085 | TUI ASES | P0 | /task TAR-XXXX deve abrir detalhe | Evento da task exibe dados reais |
| AER-REQ-086 | TUI ASES | P0 | Operação pendente deve aparecer com risco e efeito | Testar approval modal |
| AER-REQ-087 | TUI ASES | P0 | Opções inválidas devem ser rejeitadas com orientação | /config não escreve JSON inválido |
| AER-REQ-088 | TUI ASES | P0 | TUI deve continuar utilizável em 80x24 | Snapshot tests de layout |
| AER-REQ-089 | TUI ASES | P0 | NO_COLOR deve produzir texto legível | E2E no-color |
| AER-REQ-090 | TUI ASES | P0 | Fechar UI deve informar destino do motor em execução | E2E Ctrl-C preserva status |
| AER-REQ-091 | TUI ASES-TAR | P0 | `ases-tar` deve abrir em outra aba/janela | Dois processos simultâneos no E2E |
| AER-REQ-092 | TUI ASES-TAR | P0 | Exibir tasks ativas e bloqueadas com identificação | Simulator produz status visível |
| AER-REQ-093 | TUI ASES-TAR | P0 | --phase deve mostrar apenas eventos/fases pertinentes | Fixture com 2 fases |
| AER-REQ-094 | TUI ASES-TAR | P0 | --task TAR-XXXX deve mostrar somente task solicitada | Fixture com IDs distintos |
| AER-REQ-095 | TUI ASES-TAR | P0 | --errors deve exibir eventos severidade error/critical | Fixture varia severidades |
| AER-REQ-096 | TUI ASES-TAR | P0 | Timeline deve navegar histórico salvo por seq | Replay offline 100 eventos |
| AER-REQ-097 | TUI ASES-TAR | P0 | Visualizar diff não deve modificar worktree | Hash antes/depois igual |
| AER-REQ-098 | TUI ASES-TAR | P0 | Sem milestones não deve mostrar porcentagem fictícia | Tarefa nova exibe indeterminado |
| AER-REQ-099 | TUI ASES-TAR | P0 | Exibir LIVE/STALE/OFFLINE/RECONNECTING corretamente | Teste disconnect/reconnect |
| AER-REQ-100 | TUI ASES-TAR | P0 | Teclas de filtro/navegação devem ter help acessível | TUI test ?/Esc/Tab |
| AER-REQ-101 | PROVIDER CORE | P1 | Todos adapters devem implementar AgentProvider versionado | Teste de contrato por adapter |
| AER-REQ-102 | PROVIDER CORE | P1 | Probe não deve alterar conta ou instalar software | Falso binário detecta exec ilegal |
| AER-REQ-103 | PROVIDER CORE | P1 | Adapter deve verificar CLI versão antes de invocar argumentos | Version mismatch bloqueia execução |
| AER-REQ-104 | PROVIDER CORE | P1 | Parser deve aceitar chunks JSON fragmentados | Fixture divide eventos em bytes |
| AER-REQ-105 | PROVIDER CORE | P1 | Attempt deve registrar exit code real e cancel status | Fixture code 1 não vira success |
| AER-REQ-106 | PROVIDER CORE | P1 | Provider pendurado deve ser interrompido e reconciliado | Fixture sleep > timeout |
| AER-REQ-107 | PROVIDER CORE | P1 | Auth expirada vira estado distinto | Fixture unauthorized não marca rate limit |
| AER-REQ-108 | PROVIDER CORE | P1 | Provider indisponível deve degradar sem derrubar AER | Desligar simulator e consultar status |
| AER-REQ-109 | PROVIDER CORE | P1 | Subprocessos devem receber args em vetor com shell false | Teste entrada `; rm` não executa |
| AER-REQ-110 | PROVIDER CORE | P1 | Adaptador deve declarar capacidade confirmada, condicional ou desconhecida | Doctor apresenta fontes e datas |
| AER-REQ-111 | INTEGRAÇÕES | P1 | Executar através de CLI/SDK oficialmente permitido conforme modo de autenticação | Smoke read-only com user consent e transcript redigido |
| AER-REQ-112 | INTEGRAÇÕES | P1 | Integrar app-server ou exec conforme documentação vigente | Smoke com eventos reais e aprovação simulada |
| AER-REQ-113 | INTEGRAÇÕES | P1 | Usar CLI/documentação atual sem inventar flags | Probe versionado e teste opt-in |
| AER-REQ-114 | INTEGRAÇÕES | P1 | Integrar por SDK/server oficial local com escopo controlado | Sessão de teste com event stream |
| AER-REQ-115 | INTEGRAÇÕES | P1 | Selecionar CLI/SDK Google vigente e autorização realmente disponível | Sem suporte marca NOT_SUPPORTED; não falsificar |
| AER-REQ-116 | INTEGRAÇÕES | P1 | Ausência de qualquer um dos cinco não impede uso dos demais | Remover provider do PATH e abrir TUI |
| AER-REQ-117 | INTEGRAÇÕES | P1 | Uma task não deve herdar token/sessão de outro usuário/provider | Fixture multi-provider com contextos |
| AER-REQ-118 | INTEGRAÇÕES | P1 | Se adapter não suporta cancel, reportar limitações e fallback seguro | Cancel status UNKNOWN sem false positive |
| AER-REQ-119 | INTEGRAÇÕES | P1 | Toda integração exibirá status de testes reais/fakes | Doctor diferencia VERIFIED/SIMULATED/UNKNOWN |
| AER-REQ-120 | INTEGRAÇÕES | P1 | Provider deve documentar condições e não extrair OAuth privado | Scanner e code review sem uso de secrets de terceiros |
| AER-REQ-121 | AUTENTICAÇÃO | P0 | Assinatura oficial deve autenticar no respectivo cliente, não no AER | Fluxo login orientado não lê token |
| AER-REQ-122 | AUTENTICAÇÃO | P0 | Chaves API explícitas administradas pelo AER devem usar SecretStore nativo seguro | Fixture secret não aparece em arquivo e indisponibilidade falha fechado |
| AER-REQ-123 | AUTENTICAÇÃO | P0 | Uso cobrado por API exige aviso e aceite explícito | Sem aceite nenhuma chamada tarifável |
| AER-REQ-124 | AUTENTICAÇÃO | P0 | CLI logs/usage não devem incluir tokens nem email privado desnecessário | Scan de export |
| AER-REQ-125 | AUTENTICAÇÃO | P0 | Credencial expirada deve produzir estado claro e guia de reauth | Fixture expire |
| AER-REQ-126 | AUTENTICAÇÃO | P0 | AER não deve vasculhar cookies/armazenamento secreto dos CLIs | Auditoria estática de adapter |
| AER-REQ-127 | AUTENTICAÇÃO | P0 | Credenciais nunca devem transitar para adapter diferente | Teste de environment scoped |
| AER-REQ-128 | AUTENTICAÇÃO | P0 | MCP e providers devem operar só com scopes aprovados | MCP pede escopo extra e é negado |
| AER-REQ-129 | AUTENTICAÇÃO | P0 | Logout de AER não deve destruir sessão de CLI oficial sem confirmação | Teste isolado |
| AER-REQ-130 | AUTENTICAÇÃO | P0 | Projeto e simulator devem funcionar sem login externo | E2E offline |
| AER-REQ-131 | EXTENSÕES | P2 | AER deve listar Skills com paths e hashes | Fixture SKILL.md detectada |
| AER-REQ-132 | EXTENSÕES | P2 | Frontmatter inválido não deve executar scripts | Fixture malicioso rejeitado |
| AER-REQ-133 | EXTENSÕES | P2 | Cada plugin/provider deve registrar NATIVE/PORTABLE/ADAPTED/CLAUDE_ONLY/UNKNOWN/UNSUPPORTED | Matriz visível na TUI |
| AER-REQ-134 | EXTENSÕES | P2 | Plugins Claude devem ser instalados pelo mecanismo oficial | Mock do CLI recebe comando oficial; sem escrita interna |
| AER-REQ-135 | EXTENSÕES | P2 | Servidor MCP confiável pode ser iniciado sob timeout | Fixture echo MCP |
| AER-REQ-136 | EXTENSÕES | P2 | Endpoint externo exige aprovação de rede e credenciais | Deny por padrão |
| AER-REQ-137 | EXTENSÕES | P2 | Eventos de hooks devem executar sob policy e timeout | Hook security fail fecha operação |
| AER-REQ-138 | EXTENSÕES | P2 | Atualização exige inspeção de novas permissões | Fixture mudança de hash bloqueia auto enable |
| AER-REQ-139 | EXTENSÕES | P2 | Script postinstall não revisado não roda automaticamente | Fixture simula postinstall perigoso |
| AER-REQ-140 | EXTENSÕES | P2 | Compatibilidade Claude-only não é anunciada como universal | TUI e logs marcam Claude-only |
| AER-REQ-141 | USAGE | P1 | Tokens só devem ser exibidos se provedor trouxer número real | Sem dados mostra não disponível |
| AER-REQ-142 | USAGE | P1 | Quota por plano deve vir de fonte oficial com timestamp | Fixture sem quota renderiza N/D |
| AER-REQ-143 | USAGE | P1 | Métrica deve indicar janela/unidade/observedAt | `usage --json` inclui metadata |
| AER-REQ-144 | USAGE | P1 | Retry-after conhecido deve ser respeitado | Fixture 429 atrasa tentativa |
| AER-REQ-145 | USAGE | P1 | Custo deve ser identificado como API e moeda | Sem preço conhecido valor unknown |
| AER-REQ-146 | USAGE | P1 | Budget explícito deve bloquear chamadas superiores ao limite | Fixture cost ceiling |
| AER-REQ-147 | USAGE | P1 | Tela não deve mostrar soma falsa entre assinaturas | Teste snapshot multi-provider |
| AER-REQ-148 | USAGE | P1 | Token usage não deve alimentar progresso de task | Task 0 milestones ainda indeterminado |
| AER-REQ-149 | USAGE | P1 | Métrica antiga deve receber etiqueta STALE | Test TTL expirado |
| AER-REQ-150 | USAGE | P1 | Widget deve distinguir 0 comprovado de desconhecido | Test EMPTY vs UNKNOWN |
| AER-REQ-151 | ASES METHODS | P2 | Três fontes ASES incluídas devem manter hashes conhecidos | CI sha256 compara ao manifest |
| AER-REQ-152 | ASES METHODS | P2 | Matriz deve suportar e preservar textos REQ-001..REQ-300 | Contar IDs sem renumerar |
| AER-REQ-153 | ASES METHODS | P2 | Documento consolidado deve manter selo para validação | README não chama homologado |
| AER-REQ-154 | ASES METHODS | P2 | Especificador não deve repetir questões já respondidas | Fixture conversa com resposta conhecida |
| AER-REQ-155 | ASES METHODS | P2 | CONFIRMED/PROPOSED/PENDING/N-A devem aparecer claramente | Template validado |
| AER-REQ-156 | ASES METHODS | P2 | IDs do produto não devem colidir com núcleo ASES-300 | AER-REQ separado |
| AER-REQ-157 | ASES METHODS | P2 | Todo task funcional deve apontar a pelo menos um requisito | Check traceability para task criada |
| AER-REQ-158 | ASES METHODS | P2 | Tarefa sem teste exigido não fecha sem exceção aprovada | Fixture test missing |
| AER-REQ-159 | ASES METHODS | P2 | Alterar requisito aprovado exige CHANGE e impacto | Mudança bloqueada sem CHANGE |
| AER-REQ-160 | ASES METHODS | P2 | Retomada deve incluir estado decisões e critérios de aceite | Nova sessão não depende de chat anterior |
| AER-REQ-161 | SEGURANÇA | P0 | Operação não classificada deve ser negada | Teste operação unknown |
| AER-REQ-162 | SEGURANÇA | P0 | Aprovação deve vincular-se ao conteúdo exato do comando | Alterar args invalida aprovação |
| AER-REQ-163 | SEGURANÇA | P0 | AER não deve ativar flags de permissões irrestritas | Test denylist de flags |
| AER-REQ-164 | SEGURANÇA | P0 | Escrita fora das pastas permitidas deve ser negada | Teste ../ e symlink |
| AER-REQ-165 | SEGURANÇA | P0 | Comando shell deve ser executado sem interpolação | Injection fixture |
| AER-REQ-166 | SEGURANÇA | P0 | Scanner deve redigir secrets em todo sink | Scan JSONL, stdout, crash report |
| AER-REQ-167 | SEGURANÇA | P0 | Texto de ferramenta não deve elevar nível de instrução | Fixture MALICIOUS.md |
| AER-REQ-168 | SEGURANÇA | P0 | Instalação de extensão sem revisão de source e scripts deve exigir approval | Fixture npm plugin malicioso |
| AER-REQ-169 | SEGURANÇA | P0 | Delete/push/publish deve exigir confirmação específica | Teste operação sem approval não roda |
| AER-REQ-170 | SEGURANÇA | P0 | Outro usuário não deve conseguir ler/alterar socket | Teste permissões/peer id |
| AER-REQ-171 | SEGURANÇA | P0 | Task deve respeitar timeouts e limites de bytes observados | Fixture flood stdout |
| AER-REQ-172 | SEGURANÇA | P0 | Update nunca deve sobrescrever dados sem backup/migração | Teste crash update |
| AER-REQ-173 | SEGURANÇA | P0 | Bypass permitido por dono deve ter validade/escopo e audit trail | Approval record completo |
| AER-REQ-174 | SEGURANÇA | P0 | Configuração padrão não deve exfiltrar dados locais a terceiros além do provider escolhido | Network integration test com endpoint fake |
| AER-REQ-175 | SEGURANÇA | P0 | Exportação de logs deve permitir preview e redaction | Fixture PII não sai em default |
| AER-REQ-176 | HANDOFF | P2 | Toda troca de provider deve gerar HANDOFF.md com estado confirmado | Simulação Claude→Codex com diff e next steps |
| AER-REQ-177 | HANDOFF | P2 | Agent recebe documentos necessários e não todo histórico indiscriminadamente | Test prompt pack sem task alheia |
| AER-REQ-178 | HANDOFF | P2 | Compressão deve manter ponteiros para fontes/eventos originais | Arquivo summary contém seq IDs |
| AER-REQ-179 | HANDOFF | P2 | Pacote deve respeitar budget de caracteres/tokens estimados | Teste contra limite definido |
| AER-REQ-180 | HANDOFF | P2 | Sem storage remoto runtime deve preservar checkpoint local | Smoke offline |
| AER-REQ-181 | HANDOFF | P2 | Sessão encerrada produz STATUS/NEXT-STEPS/HANDOFF | E2E exit |
| AER-REQ-182 | HANDOFF | P2 | Reexecutar resume não deve duplicar attempt já ativo | Double resume test |
| AER-REQ-183 | HANDOFF | P2 | Export deve excluir credenciais dos cofres nativos, tokens e endpoints IPC | Archive scanner |
| AER-REQ-184 | HANDOFF | P2 | Handoff deve indicar claramente validação não concluída | Teste output status |
| AER-REQ-185 | HANDOFF | P2 | Lições aprendidas devem ser distintas de decisões aprovadas | Knowledge file tem source and confidence |
| AER-REQ-186 | QUALITY | P1 | Task deve registrar test runs reais com exit e timestamp | STATUS aponta test run evidência |
| AER-REQ-187 | QUALITY | P1 | Reviewer deve ter modo read-only e relatório | Fixture revisor tenta escrita e é negado |
| AER-REQ-188 | QUALITY | P1 | Merge exige testes/approvals configurados | Sem test run merge negado |
| AER-REQ-189 | QUALITY | P1 | Texto 'tests passed' não encerra task se não houver test run | Test fake agent output |
| AER-REQ-190 | QUALITY | P1 | Repo deve ter lint, typecheck e test automatizados | Workflow execute em CI compatível |
| AER-REQ-191 | QUALITY | P1 | Testar `ases` e `ases-tar` em processos separados | PIDs distintos no teste |
| AER-REQ-192 | QUALITY | P1 | Matar processo entre commit e export recupera estado | Fault injection |
| AER-REQ-193 | QUALITY | P1 | Schema de evento desconhecido gera diagnóstico e fallback | Fixture unknown payload |
| AER-REQ-194 | QUALITY | P1 | Testes pendurados são encerrados sem bloquear CI indefinidamente | Fixture timeout |
| AER-REQ-195 | QUALITY | P1 | Relatório deve diferenciar testado, não testado e ignorado | CI report distingue NOT_RUN |
| AER-REQ-196 | MACOS | P2 | Armazenar API key gerenciada somente com API oficial segura no SO | Teste fake SecretStore e integração opt-in |
| AER-REQ-197 | MACOS | P2 | Daemon só registra launch agent após consentimento explícito | Install não cria serviço automaticamente |
| AER-REQ-198 | MACOS | P2 | Runtime deve indicar estado independente da UI | Fechar UI e verificar heartbeat |
| AER-REQ-199 | MACOS | P2 | Aviso de tarefa/approval pode usar notificações macOS opt-in | Desabilitado por padrão em teste |
| AER-REQ-200 | MACOS | P2 | Terminal.app e outros terminais suportados devem respeitar TTY | smoke em terminals disponíveis |
| AER-REQ-201 | MACOS | P2 | SIGWINCH deve reflow layout sem stack trace | Teste resize |
| AER-REQ-202 | MACOS | P2 | IPC e DB devem respeitar POSIX mode no macOS/Linux e DACL no Windows | POSIX stat e Windows ACL validados |
| AER-REQ-203 | MACOS | P2 | Monitor deve ter refresh adaptativo sem polling intensivo | Benchmark idle CPU documentado |
| AER-REQ-204 | MACOS | P2 | Doctor deve identificar arm64/x86_64 com precisão | Test arch stubs |
| AER-REQ-205 | RELEASE | P3 | SemVer e changelog devem acompanhar releases | Package e tag coincidem |
| AER-REQ-206 | RELEASE | P3 | npm package deve conter bin e arquivos necessários | `npm pack --dry-run` verificado |
| AER-REQ-207 | RELEASE | P3 | Tap Homebrew não é pré-requisito de MVP | Release docs distinguem planned vs done |
| AER-REQ-208 | RELEASE | P3 | Artefatos publicados têm SHA-256 para verificação | Manifest checksums confere |
| AER-REQ-209 | RELEASE | P3 | Release público deve acompanhar inventário de dependências | Gerar SBOM e arquivar |
| AER-REQ-210 | RELEASE | P3 | Nenhuma publicação pública sem licença decidida pelo responsável | Gate release exige LICENSE válido |
| AER-REQ-211 | RELEASE | P3 | SECURITY.md deve indicar disclosure e versões suportadas | Arquivo validado |
| AER-REQ-212 | RELEASE | P3 | README deve mostrar instalação/doctor/primeiro projeto | Smoke roteiro usuário |
| AER-REQ-213 | RELEASE | P3 | Upgrade deve manter projetos antigos ou bloquear com instrução | Migration fixtures n-1 |
| AER-REQ-214 | RELEASE | P3 | Relatório final deve citar links oficiais de integração e data de verificação | docs/PROVIDERS.md inclui fontes |
| AER-REQ-215 | ADVANCED | P4 | Escolha de IA deve registrar rationale e incerteza | Route report apresenta scoring/constraints |
| AER-REQ-216 | ADVANCED | P4 | Subagentes não podem spawnar indefinidamente | Depth/spawn limit test |
| AER-REQ-217 | ADVANCED | P4 | Dupla implementação requer aceite de custo extra | Sem aceite só 1 executor |
| AER-REQ-218 | ADVANCED | P4 | Replay dos eventos deve funcionar sem acesso a provedor | Modo offline 100 eventos |
| AER-REQ-219 | ADVANCED | P4 | Recuperação deve criar branch isolada sem hard reset | HEAD principal inalterado |
| AER-REQ-220 | ADVANCED | P4 | Simulação deve ter marca `SIMULATED` em todas as telas | Assertion de label |
| AER-REQ-221 | ADVANCED | P4 | Métricas agregadas não transmitem dados sem consentimento | Mock network sem outbound |
| AER-REQ-222 | ADVANCED | P4 | Autocorreção respeita limite de tentativas e revisão | Fixture loop pára no limite |
| AER-REQ-223 | ADVANCED | P4 | Import/export devem recuperar docs sem credenciais | Roundtrip redigido |
| AER-REQ-224 | ADVANCED | P4 | Erros repetidos devem agrupar por assinatura verificável | Fixture com 3 falhas iguais gera 1 grupo |
| AER-REQ-225 | CROSS-PLATFORM | P0 | O produto terá macOS, Windows e Linux como três plataformas oficiais de destino com matriz de suporte publicada | Smoke real em macOS, Windows e Linux antes da etiqueta multiplataforma estável |
| AER-REQ-226 | CROSS-PLATFORM | P0 | Core deverá usar PlatformAdapter sem importar diretamente APIs exclusivas de sistemas operacionais | Teste de fronteiras de imports e fake darwin/win32/linux |
| AER-REQ-227 | CROSS-PLATFORM | P0 | Windows deverá usar Named Pipe local autenticado por identidade do usuário e ACL apropriada | E2E dois processos PowerShell e teste de negação para identidade diferente |
| AER-REQ-228 | CROSS-PLATFORM | P0 | macOS/Linux deverão usar Unix Domain Socket em runtime dir privado | E2E de protocolo e isolamento Unix em ambos os sistemas |
| AER-REQ-229 | CROSS-PLATFORM | P0 | Chaves gerenciadas usarão Keychain no Mac, WinCred no Windows e Secret Service no Linux quando disponíveis | Testes de integração e negação de persistência quando cofre indisponível |
| AER-REQ-230 | CROSS-PLATFORM | P0 | Todas as operações suportarão caminhos Windows/POSIX com espaços Unicode e diretórios com ACLs | Fixtures com UNC, C:, acentos, symlinks/junctions e project root |
| AER-REQ-231 | CROSS-PLATFORM | P0 | O lifecycle de agentes deverá gerenciar árvores de processos de forma segura por SO | Teste de cancelamento sem processos órfãos em macOS Windows Linux |
| AER-REQ-232 | CROSS-PLATFORM | P0 | Um único pacote npm deverá disponibilizar ases e ases-tar em macOS Windows Linux | npm pack install smoke de dois bins em bash zsh e PowerShell |
| AER-REQ-233 | CROSS-PLATFORM | P0 | CI deverá executar testes independentes por SO com estados PASS FAIL NOT_RUN | Pipeline com macOS Windows Ubuntu e publicação de matriz |
| AER-REQ-234 | CROSS-PLATFORM | P0 | TUI deverá operar sem navegador em Terminal.app Windows Terminal/PowerShell e terminais Linux | PTY/ConPTY E2E e testes sem TTY com fallback legível |
| AER-REQ-235 | CROSS-PLATFORM | P1 | Persistência de jobs após saída da TUI usará supervisor adequado e nunca exigirá admin por padrão | Testes launchd systemd-user e Windows por sessão ou marcar UNSUPPORTED |
| AER-REQ-236 | CROSS-PLATFORM | P0 | Driver SQLite deverá operar nos três sistemas e arquiteturas anunciados | Migração transacional e recuperação E2E em três SO |
| AER-REQ-237 | CROSS-PLATFORM | P1 | Execução de provider não interpolará argumentos em shell e lidará com executáveis .cmd no Windows | Testes de injeção e quoting no PowerShell POSIX |
| AER-REQ-238 | CROSS-PLATFORM | P0 | ases doctor deverá reportar suporte efetivo, permissões, store, IPC e terminal por SO | Fixtures com recursos ausentes e relatório acionável em Win Linux Mac |
| AER-REQ-239 | CROSS-PLATFORM | P1 | Windows arm64/Linux arm64 ou distros não validadas não serão declarados suportados sem testes | Matriz do release apresenta suportado pendente ou não suportado |
| AER-REQ-240 | EUREKA42-BRANDING | P0 | Telas ases e ases-tar identificarão o produto como Eureka42 ASES Engineering Runtime | Screenshots texto snapshot de welcome e monitor exibem Eureka42 sem omissão |
| AER-REQ-241 | EUREKA42-BRANDING | P0 | Logo de terminal usará glifo Unicode ⌘ U+2318 com alternativa ASCII E42 | Golden tests da variante Unicode e fallback ASCII |
| AER-REQ-242 | EUREKA42-BRANDING | P1 | Documentação reconhecerá Noto Sans Symbols 2 para ⌘, Inter para Eureka e Montserrat ExtraBold para 42 no estudo de marca | Arquivo branding cita fontes de referência sem afirmar controle da fonte do terminal |
| AER-REQ-243 | EUREKA42-BRANDING | P0 | O terminal disponibilizará temas teal blue purple gold e mono com contrastes adequados | Snapshot de cores e contraste em dark/light |
| AER-REQ-244 | EUREKA42-BRANDING | P0 | Logo terá versões full compact minimal ascii selecionadas conforme viewport e opção CLI | Snapshots 40 50 80 120 colunas sem overflow |
| AER-REQ-245 | EUREKA42-BRANDING | P0 | NO_COLOR e --no-color deverão desativar escapes ANSI e conservar informação textual | stdout sem sequências ANSI em smoke |
| AER-REQ-246 | EUREKA42-BRANDING | P1 | Animação será opcional e desligada em CI redirect TERM dumb e reduced motion | Testes de redirecionamento e --no-animation |
| AER-REQ-247 | EUREKA42-BRANDING | P0 | Saídas --json e logs JSONL nunca receberão ASCII art ou cores | Parser JSONL e JSON aceitam stdout puro |
| AER-REQ-248 | EUREKA42-BRANDING | P1 | Ambas TUIs usarão mesma fonte de configuração de cores e tokens sem divergência | Snapshot ases comparado ao ases-tar por tokens |
| AER-REQ-249 | EUREKA42-BRANDING | P1 | Usuário poderá definir theme e logo por CLI projeto e configuração global | Testes de precedência CLI > projeto > global > default |
| AER-REQ-250 | EUREKA42-BRANDING | P0 | Kit deve preservar imagem original de estudo de marca e não incluir fontes tipográficas proprietárias | SHA-256 da imagem e auditoria do pacote sem arquivos de fontes |
