import { describe, expect, it } from 'vitest';
import { createLinuxAdapter } from '../src/index.js';

describe('createLinuxAdapter', () => {
  it('reports platform linux and the expected IPC transport', () => {
    const a = createLinuxAdapter({ env: {}, tmpdir: '/tmp', homedir: '/h', username: 'u' });
    expect(a.id).toBe('linux');
    expect(a.createLocalIpcEndpoint('prj_x').kind).toBe('uds');
  });
});
