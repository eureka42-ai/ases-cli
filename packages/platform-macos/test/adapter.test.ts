import { describe, expect, it } from 'vitest';
import { createMacosAdapter } from '../src/index.ts';

describe('createMacosAdapter', () => {
  it('reports platform darwin and the expected IPC transport', () => {
    const a = createMacosAdapter({ env: {}, tmpdir: '/tmp', homedir: '/h', username: 'u' });
    expect(a.id).toBe('darwin');
    expect(a.createLocalIpcEndpoint('prj_x').kind).toBe('uds');
  });
});
