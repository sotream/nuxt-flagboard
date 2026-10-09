// Starts the COMPILED server (dist/main.js) and checks it end to end. Unit and e2e tests run the TypeScript
// source through Vitest, which hides problems that only exist in the built ESM output (for example a circular
// import between entities). Run it after `pnpm build` with the database migrated:  pnpm --filter api smoke
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
if (existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'));

const port = await new Promise((resolve) => {
  const probe = createServer().listen(0, () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});
const base = `http://127.0.0.1:${port}`;
const output = [];
const server = spawn(process.execPath, ['dist/main.js'], {
  cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  env: { ...process.env, PORT: String(port), LOG_LEVEL: 'warn' },
});
server.stdout.on('data', (chunk) => output.push(String(chunk)));
server.stderr.on('data', (chunk) => output.push(String(chunk)));
const exited = new Promise((resolve) =>
  server.on('exit', (code, signal) => resolve({ code, signal })),
);

function fail(message) {
  console.error(`SMOKE FAILED: ${message}`);
  if (output.length > 0) console.error(output.join('').split('\n').slice(0, 12).join('\n'));
  server.kill('SIGKILL');
  process.exit(1);
}

async function waitForHealth() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/health`);
      if (response.status === 200) return;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  fail('the server did not answer /health within 20 s');
}

async function expectStatus(label, request, expected) {
  const response = await request;
  if (response.status !== expected) fail(`${label}: expected ${expected}, got ${response.status}`);
  console.log(`ok  ${label} -> ${expected}`);
}

await waitForHealth();
console.log(`ok  /health answers on port ${port}`);

// These touch the database and the entity mappings, so they fail if the compiled entities are broken.
await expectStatus(
  'sign-in with unknown credentials',
  fetch(`${base}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: process.env.WEB_ORIGIN ?? 'http://localhost:3010',
    },
    body: JSON.stringify({ email: 'nobody@example.com', password: 'not-a-real-password' }),
  }),
  401,
);
await expectStatus('admin API without a token', fetch(`${base}/api/v1/projects`), 401);
await expectStatus(
  'public API with an unknown key',
  fetch(`${base}/v1/evaluate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer fb_srv_${'A'.repeat(43)}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  }),
  401,
);

server.kill('SIGTERM');
const timeout = setTimeout(() => fail('the server did not stop within 15 s of SIGTERM'), 15_000);
const { code, signal } = await exited;
clearTimeout(timeout);
// With shutdown hooks enabled Nest closes the app and then re-sends the signal to itself, so a clean stop ends
// either with code 0 or "killed by SIGTERM". A hang would hit the timeout above instead.
if (code !== 0 && signal !== 'SIGTERM')
  fail(`the server exited with code ${code} (signal ${signal}) after SIGTERM`);
console.log(`ok  SIGTERM stops the server (code ${code}, signal ${signal})`);
