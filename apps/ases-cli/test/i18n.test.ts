import { afterEach, describe, expect, it } from 'vitest';
import { CHAT_ALIASES, chatHelp, filterMenu } from '../src/chat-commands.ts';
import { cmdName, lang, machineLang, parseLang, setLang, t } from '../src/i18n.ts';

// 1.4.0: a interface segue o idioma da máquina (ou /config idioma); os comandos em pt e en funcionam sempre.
afterEach(() => setLang(undefined));

describe('language of the machine', () => {
  it('reads LC_ALL > LC_MESSAGES > LANG > LANGUAGE; C/POSIX say nothing', () => {
    expect(machineLang({ LANG: 'pt_BR.UTF-8' })).toBe('pt');
    expect(machineLang({ LANG: 'en_US.UTF-8' })).toBe('en');
    expect(machineLang({ LC_ALL: 'es_MX.UTF-8', LANG: 'pt_BR.UTF-8' })).toBe('es');
    expect(machineLang({ LANG: 'de_DE.UTF-8' })).toBe('en'); // sem tradução: inglês
    expect(machineLang({ LANG: 'C.UTF-8', LANGUAGE: 'pt_BR:pt' })).toBe('pt');
    expect(parseLang('POSIX')).toBeUndefined();
  });

  it('tests run in Portuguese (AER_LANG)', () => {
    expect(lang()).toBe('pt');
  });
});

describe('menu and help follow the language', () => {
  it('English shows /model, /help, /sync; typing /mod finds /model', () => {
    setLang('en');
    expect(cmdName('/modelo')).toBe('/model');
    expect(filterMenu('/mod')).toEqual([{ cmd: '/modelo', name: '/model', desc: "choose each AI's model (← → ↑ ↓ and Space)" }]);
    expect(filterMenu('/modelo').map((m) => m.name)).toEqual(['/model']); // o nome em português também acha
    expect(chatHelp()).toContain('/sync');
    expect(t('start.where')).toBe('Where shall we work?');
  });

  it('Spanish has its own names; Portuguese keeps the originals', () => {
    setLang('es');
    expect(cmdName('/ajuda')).toBe('/ayuda');
    expect(t('start.local')).toBe('Solo en esta máquina');
    setLang('pt');
    expect(cmdName('/modelo')).toBe('/modelo');
    expect(filterMenu('/mod')[0]).toMatchObject({ cmd: '/modelo', name: '/modelo' });
  });

  it('every translated name routes to the same command', () => {
    for (const [alias, pt] of [['/model', '/modelo'], ['/sync', '/sincronizar'], ['/connect', '/conectar'], ['/ayuda', '/ajuda'], ['/jobs', '/tarefas'], ['/agent', '/ia']]) expect(CHAT_ALIASES[alias!], alias).toBe(pt);
  });
});
