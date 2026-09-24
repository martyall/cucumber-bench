import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// brainfog is a python program in a sibling repository (../brainfog next to this one), run
// with uv. the runner gives a harness only PATH and HOME, so it is found by path. the case
// goes through on stdin and the result comes back on stdout, untouched
let root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../brainfog');
let child = spawn('uv', ['run', '--quiet', '--project', root, 'brainfog'], { stdio: ['pipe', 'pipe', 'inherit'] });
child.on('error', (err) => {
  process.stdout.write(JSON.stringify({ error: `brainfog-v1: cannot start uv in ${root}: ${err.message}` }));
  process.exit(1);
});
process.stdin.pipe(child.stdin);
child.stdout.pipe(process.stdout);
child.on('exit', (code) => process.exit(code ?? 1));
