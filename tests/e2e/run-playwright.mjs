import { spawn } from 'node:child_process';

const env = { ...process.env };
delete env['NO_COLOR'];

const child = spawn('playwright', process.argv.slice(2), {
  stdio: 'inherit',
  env,
});

child.on('exit', (code, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});

child.on('error', (error) => {
  process.stderr.write(`${error}\n`);
  process.exitCode = 1;
});
