// Load test of the two hot public endpoints with autocannon. Not part of CI: numbers from a shared runner say
// little. Run it against a seeded API on your own machine:
//
//   pnpm build && pnpm db:migrate && pnpm db:seed          # the seed prints the server key
//   API_KEY_RATE_LIMIT_PER_MINUTE=1000000 node apps/api/dist/main.js   # the default limit (600/min) would answer 429
//   FLAGBOARD_SERVER_KEY=fb_srv_... pnpm bench
//
// Optional: FLAGBOARD_URL (default http://localhost:4010).
import os from 'node:os';
import autocannon from 'autocannon';

const baseUrl = process.env.FLAGBOARD_URL ?? 'http://localhost:4010';
const key = process.env.FLAGBOARD_SERVER_KEY;
if (!key) {
  console.error('Set FLAGBOARD_SERVER_KEY (the seed prints it).');
  process.exit(1);
}

const REQUESTS_PER_SECOND = 200;
const CONNECTIONS = 10;
const WARM_UP_SECONDS = 5;
const MEASURE_SECONDS = 20;
// autocannon reports p90, p97.5 and p99 but not p95. The p97.5 is always at or above the p95, so staying under a
// target at p97.5 also means staying under it at p95.
const TARGETS_MS = { evaluate: 25, 'snapshot (304)': 10 };

const authorization = { authorization: `Bearer ${key}` };

/** One autocannon run. `expectedStatus` is the only status that counts as success. */
async function run(title, options, expectedStatus) {
  const result = await autocannon({
    connections: CONNECTIONS,
    overallRate: REQUESTS_PER_SECOND,
    ...options,
  });
  const statuses = result.statusCodeStats ?? {};
  const unexpected = Object.entries(statuses)
    .filter(([status]) => Number(status) !== expectedStatus)
    .reduce((sum, [, stat]) => sum + stat.count, 0);
  return { title, result, unexpected, errors: result.errors + result.timeouts };
}

const evaluate = {
  url: `${baseUrl}/v1/evaluate`,
  method: 'POST',
  headers: { ...authorization, 'content-type': 'application/json' },
  body: JSON.stringify({
    flags: ['new-checkout', 'dark-mode', 'editor', 'premium-export', 'payments-v2'],
    context: { userId: 'user-42', attributes: { country: 'UA', plan: 'pro' } },
  }),
};

const first = await fetch(`${baseUrl}/v1/snapshot`, { headers: authorization });
const etag = first.headers.get('etag');
if (!first.ok || !etag) {
  console.error(
    `GET /v1/snapshot answered ${first.status}; is the key a server key of a seeded API?`,
  );
  process.exit(1);
}
const snapshot = {
  url: `${baseUrl}/v1/snapshot`,
  method: 'GET',
  headers: { ...authorization, 'if-none-match': etag },
};

const scenarios = [
  ['evaluate', evaluate, 200],
  ['snapshot (304)', snapshot, 304],
];

const rows = [];
for (const [title, options, expectedStatus] of scenarios) {
  console.error(
    `${title}: warm-up ${WARM_UP_SECONDS} s, then ${MEASURE_SECONDS} s at ${REQUESTS_PER_SECOND} req/s`,
  );
  await run(title, { ...options, duration: WARM_UP_SECONDS }, expectedStatus);
  rows.push(await run(title, { ...options, duration: MEASURE_SECONDS }, expectedStatus));
}

const cpu = os.cpus();
console.log(
  `machine: ${cpu[0]?.model} x${cpu.length}, ${Math.round(os.totalmem() / 2 ** 30)} GB, ${os.platform()} ${os.arch()}, Node ${process.version}`,
);
console.log(
  `load: ${REQUESTS_PER_SECOND} req/s over ${CONNECTIONS} connections, ${MEASURE_SECONDS} s after a ${WARM_UP_SECONDS} s warm-up`,
);
console.log(
  '| endpoint | requests | req/s | p50 ms | p90 ms | p97.5 ms | p99 ms | unexpected status | target p95 |',
);
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
let failed = false;
for (const { title, result, unexpected, errors } of rows) {
  const { latency } = result;
  const target = TARGETS_MS[title];
  const met = latency.p97_5 < target && unexpected === 0 && errors === 0;
  failed ||= !met;
  console.log(
    `| ${title} | ${result.requests.total} | ${Math.round(result.requests.average)} | ${latency.p50} | ${latency.p90} | ${latency.p97_5} | ${latency.p99} | ${unexpected + errors} | < ${target} ms: ${met ? 'met' : 'NOT met'} |`,
  );
}
process.exit(failed ? 1 : 0);
