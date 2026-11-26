import { languagePreference } from '@aer/project-store';

// 1.4.0: idioma da interface. Ordem: AER_LANG (testes/scripts) > /config idioma (config pessoal) > idioma da máquina
// (LC_ALL, LC_MESSAGES, LANG, LANGUAGE; no Windows, o do sistema via Intl) > português. Os comandos em português e
// em inglês funcionam sempre, em qualquer idioma; o idioma só muda o que aparece no menu, na ajuda e nas telas.

export const LANGS = ['pt', 'en', 'es'] as const;
export type Lang = (typeof LANGS)[number];

export function parseLang(v: string | undefined): Lang | undefined {
  const s = (v ?? '').toLowerCase().trim();
  if (!s || s === 'c' || s.startsWith('c.') || s === 'posix') return undefined;
  if (s.startsWith('pt')) return 'pt';
  if (s.startsWith('es')) return 'es';
  if (s.startsWith('en')) return 'en';
  return undefined;
}

/** Idioma da máquina; sem informação útil, undefined. */
export function machineLang(env: Readonly<Record<string, string | undefined>> = process.env): Lang | undefined {
  for (const k of ['LC_ALL', 'LC_MESSAGES', 'LANG', 'LANGUAGE']) {
    const v = env[k];
    if (!v) continue;
    const l = parseLang(v.split(':')[0]);
    if (l) return l;
    // outro idioma declarado (de_DE, fr_FR…): inglês é o mais próximo de universal
    if (!/^(c|posix)(\.|$)/i.test(v)) return 'en';
  }
  try {
    return parseLang(Intl.DateTimeFormat().resolvedOptions().locale) ?? 'en';
  } catch {
    return undefined;
  }
}

let current: Lang | undefined;

export function lang(): Lang {
  current ??= parseLang(process.env.AER_LANG) ?? parseLang(languagePreference()) ?? machineLang() ?? 'pt';
  return current;
}

/** Troca na hora (o /config idioma) e nos testes. */
export function setLang(l: Lang | undefined): void {
  current = l;
}

type Dict = Record<string, string>;
const T: Record<Lang, Dict> = { pt: {}, en: {}, es: {} };

/** t('chave', {n: 2}) → texto no idioma atual; sem tradução, cai no português. */
export function t(key: string, vars: Record<string, string | number> = {}): string {
  const raw = T[lang()][key] ?? T.pt[key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}

function add(key: string, pt: string, en: string, es: string): void {
  T.pt[key] = pt;
  T.en[key] = en;
  T.es[key] = es;
}

// ---- nomes dos comandos no menu (os outros idiomas continuam aceitos como alias) ----
export const CMD_NAMES: Record<string, { en: string; es: string }> = {
  '/ajuda': { en: '/help', es: '/ayuda' },
  '/iniciar-projeto': { en: '/start-project', es: '/iniciar-proyecto' },
  '/ia': { en: '/agent', es: '/agente' },
  '/ias': { en: '/agents', es: '/agentes' },
  '/plano': { en: '/plan', es: '/plan' },
  '/auto': { en: '/auto', es: '/auto' },
  '/tarefas': { en: '/jobs', es: '/trabajos' },
  '/ver': { en: '/diff', es: '/diff' },
  '/aceitar': { en: '/accept', es: '/aceptar' },
  '/refazer': { en: '/redo', es: '/rehacer' },
  '/trocar': { en: '/assign', es: '/asignar' },
  '/desfazer': { en: '/undo', es: '/deshacer' },
  '/parar': { en: '/stop', es: '/detener' },
  '/nova': { en: '/new', es: '/nueva' },
  '/modelo': { en: '/model', es: '/modelo' },
  '/config': { en: '/settings', es: '/ajustes' },
  '/sincronizar': { en: '/sync', es: '/sincronizar' },
  '/conectar': { en: '/connect', es: '/conectar' },
  '/atualizar': { en: '/update', es: '/actualizar' },
  '/sobre': { en: '/about', es: '/acerca' },
  '/sair': { en: '/exit', es: '/salir' },
};

/** Nome do comando no idioma atual (o interno é o português). */
export const cmdName = (pt: string): string => (lang() === 'pt' ? pt : (CMD_NAMES[pt]?.[lang() as 'en' | 'es'] ?? pt));

/** Todos os nomes traduzidos → comando interno (aceitos em qualquer idioma). */
export function translatedAliases(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [pt, n] of Object.entries(CMD_NAMES)) {
    for (const x of [n.en, n.es]) if (x !== pt) out[x] = pt;
  }
  return out;
}

add('menu./ajuda', 'o que dá para fazer', 'what you can do', 'lo que se puede hacer');
add('menu./iniciar-projeto', 'metodologia guiada: ASES-500 → requisitos → ASES-300 → GitHub', 'guided methodology: ASES-500 → requirements → ASES-300 → GitHub', 'metodología guiada: ASES-500 → requisitos → ASES-300 → GitHub');
add('menu./ia', 'mostra ou troca a IA principal', 'show or change the main AI', 'muestra o cambia la IA principal');
add('menu./ias', 'IAs instaladas, logadas, livres ou ocupadas', 'installed, logged-in, free or busy AIs', 'IAs instaladas, conectadas, libres u ocupadas');
add('menu./plano', 'mostra o plano; Enter executa', 'show the plan; Enter runs it', 'muestra el plan; Enter lo ejecuta');
add('menu./auto', 'liga ou desliga o modo automático', 'turn automatic mode on or off', 'activa o desactiva el modo automático');
add('menu./tarefas', 'tarefas da conversa, ao vivo', "this conversation's tasks, live", 'tareas de la conversación, en vivo');
add('menu./ver', 'o que uma tarefa mudou (/ver 12)', 'what a task changed (/diff 12)', 'lo que cambió una tarea (/diff 12)');
add('menu./aceitar', 'traz o trabalho pronto para o projeto', 'bring finished work into the project', 'trae el trabajo listo al proyecto');
add('menu./refazer', 'devolve a tarefa com o motivo', 'send a task back with a reason', 'devuelve la tarea con el motivo');
add('menu./trocar', 'troca a IA de uma tarefa', "change a task's AI", 'cambia la IA de una tarea');
add('menu./desfazer', 'desfaz a última edição da principal', "undo the main AI's last edit", 'deshace la última edición de la principal');
add('menu./parar', 'para tudo', 'stop everything', 'detiene todo');
add('menu./nova', 'começa uma conversa nova', 'start a new conversation', 'empieza una conversación nueva');
add('menu./modelo', 'escolhe o modelo de cada IA (← → ↑ ↓ e Espaço)', 'choose each AI\'s model (← → ↑ ↓ and Space)', 'elige el modelo de cada IA (← → ↑ ↓ y Espacio)');
add('menu./config', 'tema, logo, idioma, modo, limites, teste, autorizações', 'theme, logo, language, mode, limits, test, permissions', 'tema, logo, idioma, modo, límites, prueba, permisos');
add('menu./sincronizar', 'leva o projeto para outra máquina: GitHub, nuvem ou os dois', 'take the project to another machine: GitHub, cloud or both', 'lleva el proyecto a otra máquina: GitHub, nube o ambos');
add('menu./conectar', 'conecta uma nuvem: Google Drive, OneDrive ou Dropbox (login no navegador)', 'connect a cloud: Google Drive, OneDrive or Dropbox (browser login)', 'conecta una nube: Google Drive, OneDrive o Dropbox (login en el navegador)');
add('menu./atualizar', 'atualiza o AER pelo npm', 'update AER from npm', 'actualiza AER desde npm');
add('menu./sobre', 'quem faz o Eureka42', 'who makes Eureka42', 'quién hace Eureka42');
add('menu./sair', 'sai do ases', 'quit ases', 'sale de ases');

add('help.intro', 'Converse em texto livre com a IA principal; ela lê, planeja e edita o projeto ({undo} volta).\nPedidos grandes viram um plano que o ASES divide entre as outras IAs, em paralelo.',
  'Chat in plain text with the main AI; it reads, plans and edits the project ({undo} reverts).\nBig requests become a plan that ASES splits among the other AIs, in parallel.',
  'Conversa en texto libre con la IA principal; lee, planifica y edita el proyecto ({undo} revierte).\nLos pedidos grandes se vuelven un plan que ASES reparte entre las otras IAs, en paralelo.');
add('help.other', 'Os comandos em português e em inglês funcionam sempre. Idioma: /config idioma pt|en|es', 'Portuguese and English commands always work. Language: /settings language pt|en|es', 'Los comandos en portugués e inglés siempre funcionan. Idioma: /ajustes idioma pt|en|es');
add('help.advanced', 'Comandos técnicos (fases, tarefas, gates): /ajuda avançado · eureka42.org', 'Technical commands (phases, tasks, gates): /help advanced · eureka42.org', 'Comandos técnicos (fases, tareas, gates): /ayuda avanzado · eureka42.org');

// ---- tela inicial ----
add('start.where', 'Onde vamos trabalhar?', 'Where shall we work?', '¿Dónde vamos a trabajar?');
add('start.this', 'Esta pasta ({p})', 'This folder ({p})', 'Esta carpeta ({p})');
add('start.desktop', 'Mesa ({p})', 'Desktop ({p})', 'Escritorio ({p})');
add('start.new', 'Novo projeto… (em {p})', 'New project… (in {p})', 'Proyecto nuevo… (en {p})');
add('start.remote', 'Abrir de outra máquina… ({from})', 'Open from another machine… ({from})', 'Abrir desde otra máquina… ({from})');
add('start.connect', 'Conectar uma nuvem… (Google Drive, OneDrive, Dropbox)', 'Connect a cloud… (Google Drive, OneDrive, Dropbox)', 'Conectar una nube… (Google Drive, OneDrive, Dropbox)');
add('start.connectOther', 'Conectar outra nuvem… (agora: {c})', 'Connect another cloud… (now: {c})', 'Conectar otra nube… (ahora: {c})');
add('start.choose', 'Escolher uma pasta…', 'Choose a folder…', 'Elegir una carpeta…');
add('start.recent', 'Recente: {p}', 'Recent: {p}', 'Reciente: {p}');
add('start.footer', 'A pasta escolhida vira um projeto do ASES sozinha (nada do que já existe é apagado).', 'The chosen folder becomes an ASES project by itself (nothing existing is deleted).', 'La carpeta elegida se vuelve un proyecto de ASES sola (no se borra nada de lo que ya existe).');
add('start.typePath', 'Digite o caminho da pasta (~ é a sua pasta pessoal) e Enter; Esc volta:', 'Type the folder path (~ is your home folder) and Enter; Esc goes back:', 'Escribe la ruta de la carpeta (~ es tu carpeta personal) y Enter; Esc vuelve:');
add('start.typeName', 'Nome do projeto (a pasta fica em {p}) e Enter; Esc volta:', 'Project name (the folder goes in {p}) and Enter; Esc goes back:', 'Nombre del proyecto (la carpeta va en {p}) y Enter; Esc vuelve:');
add('start.whereKeep', 'Onde guardar {n}?', 'Where to keep {n}?', '¿Dónde guardar {n}?');
add('start.whichProject', 'Qual projeto abrir?', 'Which project to open?', '¿Qué proyecto abrir?');
add('start.whichCloud', 'Qual nuvem conectar?', 'Which cloud to connect?', '¿Qué nube conectar?');
add('start.local', 'Só nesta máquina', 'Only on this machine', 'Solo en esta máquina');
add('start.github', 'GitHub (repositório privado)', 'GitHub (private repository)', 'GitHub (repositorio privado)');
add('start.cloud', 'Nuvem ({c})', 'Cloud ({c})', 'Nube ({c})');
add('start.both', 'GitHub e nuvem', 'GitHub and cloud', 'GitHub y nube');
add('start.whereHint', 'O projeto roda nesta pasta; o GitHub/nuvem guardam uma cópia (com o contexto) a cada saída. Esc volta.', 'The project runs in this folder; GitHub/cloud keep a copy (with the context) every time you quit. Esc goes back.', 'El proyecto corre en esta carpeta; GitHub/nube guardan una copia (con el contexto) cada vez que sales. Esc vuelve.');
add('start.remoteHint', 'Baixa para {p}; se já estiver lá, só abre. Esc volta.', 'Downloads to {p}; if it is already there, just opens it. Esc goes back.', 'Descarga en {p}; si ya está ahí, solo lo abre. Esc vuelve.');
add('start.connectHint', 'O login é no navegador (o AER não vê a senha). Mega e outras: `rclone config` no terminal. Esc volta.', 'You log in in the browser (AER never sees the password). Mega and others: `rclone config` in the terminal. Esc goes back.', 'El login es en el navegador (AER no ve la contraseña). Mega y otras: `rclone config` en la terminal. Esc vuelve.');
add('start.status.cloud', 'nuvem conectada: {c}', 'cloud connected: {c}', 'nube conectada: {c}');
add('start.status.nocloud', 'nenhuma nuvem conectada', 'no cloud connected', 'ninguna nube conectada');
add('start.status.github', 'GitHub conectado', 'GitHub connected', 'GitHub conectado');
add('start.status.nogithub', 'GitHub não conectado', 'GitHub not connected', 'GitHub no conectado');
add('start.searching', 'buscando seus projetos no GitHub e na nuvem…', 'looking for your projects on GitHub and in the cloud…', 'buscando tus proyectos en GitHub y en la nube…');
add('start.none', 'nenhum projeto encontrado (envie um com /sincronizar na outra máquina)', 'no project found (send one with /sync on the other machine)', 'ningún proyecto encontrado (envía uno con /sincronizar en la otra máquina)');
add('start.downloading', 'baixando {n} de {s}… (pode levar um pouco)', 'downloading {n} from {s}… (may take a while)', 'descargando {n} desde {s}… (puede tardar un poco)');
add('start.opening', 'abrindo o navegador para você entrar no {c}… conclua o login lá (Ctrl+C cancela)', 'opening the browser so you can sign in to {c}… finish the login there (Ctrl+C cancels)', 'abriendo el navegador para que entres en {c}… termina el login ahí (Ctrl+C cancela)');
add('start.connected', '{c} conectado. Projetos novos podem ser guardados lá.', '{c} connected. New projects can be kept there.', '{c} conectado. Los proyectos nuevos se pueden guardar ahí.');
add('start.notConnected', 'não conectei: {e}', 'not connected: {e}', 'no se conectó: {e}');
add('cloud', 'nuvem', 'cloud', 'nube');

// ---- cabeçalho, seletor de modelo e status ----
add('model.default', 'modelo padrão', 'default model', 'modelo por defecto');
add('picker.title', 'Modelo de cada IA  ·  ← → IA  ·  ↑ ↓ modelo  ·  Espaço escolhe  ·  Esc fecha', 'Model per AI  ·  ← → AI  ·  ↑ ↓ model  ·  Space picks  ·  Esc closes', 'Modelo de cada IA  ·  ← → IA  ·  ↑ ↓ modelo  ·  Espacio elige  ·  Esc cierra');
add('picker.default', 'padrão (o modelo configurado na própria IA)', "default (the model set in the AI itself)", 'por defecto (el modelo configurado en la propia IA)');
add('picker.type', 'digitar outro…', 'type another…', 'escribir otro…');
add('picker.notInstalled', '{p} não está instalada nesta máquina · instale a CLI dela para usar estes modelos', '{p} is not installed on this machine · install its CLI to use these models', '{p} no está instalada en esta máquina · instala su CLI para usar estos modelos');
add('picker.notInstalledTag', '(não instalada)', '(not installed)', '(no instalada)');
add('picker.list', 'lista', 'list', 'lista');
add('sync.cloudOn', 'nuvem: {c} ✓ envia ao sair', 'cloud: {c} ✓ sends on exit', 'nube: {c} ✓ envía al salir');
add('sync.cloudLocal', 'nuvem: {c} (conectada; este projeto é só local · /sincronizar)', 'cloud: {c} (connected; this project is local only · /sync)', 'nube: {c} (conectada; este proyecto es solo local · /sincronizar)');
add('sync.noCloud', 'nuvem: não conectada (/conectar)', 'cloud: not connected (/connect)', 'nube: no conectada (/conectar)');
add('sync.githubOn', 'GitHub ✓ envia ao sair', 'GitHub ✓ sends on exit', 'GitHub ✓ envía al salir');
add('sync.githubLocal', 'GitHub (conectado; este projeto é só local)', 'GitHub (connected; this project is local only)', 'GitHub (conectado; este proyecto es solo local)');
add('banner.main', 'principal', 'main', 'principal');
add('banner.ready', '{n} IAs prontas', '{n} AIs ready', '{n} IAs listas');
add('hints', 'Enter enviar · / comandos · ↑↓ histórico · Tab tarefas · ? ajuda · Ctrl+C×2 sair', 'Enter send · / commands · ↑↓ history · Tab tasks · ? help · Ctrl+C×2 quit', 'Enter enviar · / comandos · ↑↓ historial · Tab tareas · ? ayuda · Ctrl+C×2 salir');
add('lang.set', 'idioma: {l} (vale na hora e nas próximas aberturas)', 'language: {l} (applies now and next time)', 'idioma: {l} (vale ahora y en las próximas aperturas)');
