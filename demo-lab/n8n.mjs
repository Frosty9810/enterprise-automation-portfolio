import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { n8nEnvironment } from './server.mjs';

const child = spawn(process.execPath, [fileURLToPath(new URL('./node_modules/n8n/bin/n8n', import.meta.url)), ...process.argv.slice(2)], {
  env: n8nEnvironment(), stdio: 'inherit', windowsHide: true,
});
child.on('exit', code => { process.exitCode = code ?? 1; });
