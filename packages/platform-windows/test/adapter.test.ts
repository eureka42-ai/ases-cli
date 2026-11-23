import { describe, expect, it } from 'vitest';
import { createWindowsAdapter } from '../src/index.js';

describe('createWindowsAdapter', () => {
  it('reports platform win32 and the expected IPC transport', () => {
    const a = createWindowsAdapter({ env: {}, tmpdir: 'C:\\Temp', homedir: '/h', username: 'u' });
    expect(a.id).toBe('win32');
    expect(a.createLocalIpcEndpoint('prj_x').kind).toBe('named-pipe');
  });
});
