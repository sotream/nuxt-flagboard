// A small tour of both SDK clients against a running API. Needs a seeded API (`pnpm db:seed`) and the two keys
// the seed printed:
//
//   pnpm build
//   FLAGBOARD_SERVER_KEY=fb_srv_... FLAGBOARD_CLIENT_KEY=fb_cli_... node scripts/demo-clients.ts
//
// Optional: FLAGBOARD_URL (default http://localhost:4010). Runs on Node 24, which strips the type annotations.
import {
  createLocalClient,
  createRemoteClient,
  FlagboardError,
} from '../packages/sdk/dist/index.js';
import type { Context } from '../packages/sdk/dist/index.js';

const baseUrl = process.env.FLAGBOARD_URL ?? 'http://localhost:4010';
const serverKey = process.env.FLAGBOARD_SERVER_KEY;
const clientKey = process.env.FLAGBOARD_CLIENT_KEY;
if (!serverKey || !clientKey) {
  console.error('Set FLAGBOARD_SERVER_KEY and FLAGBOARD_CLIENT_KEY (the seed prints both).');
  process.exit(1);
}

const flags = ['new-checkout', 'dark-mode', 'editor', 'premium-export', 'payments-v2'];
const contexts: { label: string; context: Context }[] = [
  { label: 'user-1 in Ukraine', context: { userId: 'user-1', attributes: { country: 'UA' } } },
  {
    label: 'user-2 in Germany',
    context: { userId: 'user-2', attributes: { country: 'DE', plan: 'pro' } },
  },
  { label: 'anonymous', context: {} },
];
const show = (r: { value: unknown; reason: string; ruleIndex?: number }) =>
  `${JSON.stringify(r.value)} (${r.reason}${r.ruleIndex === undefined ? '' : ` #${r.ruleIndex}`})`;

const local = createLocalClient({
  baseUrl,
  key: serverKey,
  onError: (e) => console.warn(`  [local] ${e.message}`),
});
const remoteServer = createRemoteClient({ baseUrl, key: serverKey });
const remoteClient = createRemoteClient({ baseUrl, key: clientKey });

try {
  console.log('1. Local client with a server key: evaluates in memory from the snapshot\n');
  await local.init();
  for (const { label, context } of contexts) {
    console.log(`  ${label}`);
    for (const flag of flags)
      console.log(`    ${flag.padEnd(15)} ${show(local.evaluate(flag, context, false))}`);
  }

  console.log(
    '\n2. Remote client with the same key: asks the server, and must agree with the local client\n',
  );
  let disagreements = 0;
  for (const { context } of contexts) {
    for (const flag of flags) {
      const remote = await remoteServer.evaluate(flag, context, false);
      if (JSON.stringify(remote) !== JSON.stringify(local.evaluate(flag, context, false))) {
        disagreements++;
        console.log(`  MISMATCH ${flag}: remote ${show(remote)}`);
      }
    }
  }
  console.log(
    `  ${disagreements === 0 ? 'identical for every flag and context' : `${disagreements} mismatches`}`,
  );

  console.log(
    '\n3. Remote client with a client key: sees only client-visible flags, and no rule indexes\n',
  );
  for (const flag of flags) {
    const result = await remoteClient.evaluate(flag, contexts[0]!.context, false);
    console.log(`    ${flag.padEnd(15)} ${show(result)}`);
  }

  console.log(
    '\n4. A client key cannot read the snapshot, so the local client refuses to start with it\n',
  );
  try {
    await createLocalClient({ baseUrl, key: clientKey }).init();
  } catch (error) {
    console.log(
      `  ${error instanceof FlagboardError ? `${error.code}: ${error.message}` : String(error)}`,
    );
  }

  console.log('\n5. Refreshing an unchanged snapshot costs a 304 and reports no change');
  console.log(`  refresh() -> ${await local.refresh()}`);
} finally {
  local.close();
  remoteServer.close();
  remoteClient.close();
}
