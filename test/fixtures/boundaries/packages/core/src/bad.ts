import { createMacosAdapter } from '@aer/platform-macos';
import { spawn } from 'node:child_process';
spawn('git', ['status'], { shell: true });
export const x = createMacosAdapter;
