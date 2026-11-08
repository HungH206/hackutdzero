// Live verification against a REAL SpacetimeDB server: two independent clients (two identities),
// one dispatcher and one observer, run the Alder Court scenario and check that
//   1. the observer sees every change through its own subscription (no refresh, no shared state),
//   2. a saved token keeps a client's identity across reconnects (so promotion sticks),
//   2b. both clients converge on identical tables,
//   3. the observer cannot override, simulate, or resolve anything, and the dispatcher can,
//   4. a refused override leaves no audit row and an accepted one is audited and synced.
//
//   npm run db:publish                                          # shared Maincloud rescuedb
//   npm run generate && npm run verify:live
//
// SIMULATION: all data is fictional. This resets the target database's simulation state.
import { execFileSync } from 'node:child_process';
import { DbConnection } from '../src/module_bindings';

import { database as DB, uri as URI, server as SERVER } from './target.mjs';
const ALDER = { x: 225, y: 175 };

type Conn = any;
const results: { name: string; ok: boolean; detail?: string }[] = [];
const check = (name: string, ok: boolean, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(label: string, fn: () => boolean, ms = 8000): Promise<number> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (fn()) return Date.now() - t0;
    await sleep(25);
  }
  throw new Error(`timed out after ${ms} ms waiting for: ${label}`);
}

function connect(name: string, token?: string): Promise<{ conn: Conn; identity: string; token: string }> {
  return new Promise((resolve, reject) => {
    const conn: Conn = DbConnection.builder()
      .withUri(URI)
      .withDatabaseName(DB)
      .withToken(token)
      .onConnect((c: Conn, identity: { toHexString(): string }, issued: string) => {
        c.subscriptionBuilder()
          .onApplied(() => resolve({ conn: c, identity: identity.toHexString(), token: issued }))
          .subscribeToAllTables();
      })
      .onConnectError((_c: unknown, e: unknown) => reject(new Error(`${name} could not connect to ${URI}: ${String(e)}`)))
      .build();
    void conn;
  });
}

const rows = (c: Conn, table: string): any[] => [...c.db[table].iter()];
const norm = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x));
const keyed = (c: Conn, table: string, key: string) => rows(c, table).sort((a, b) => Number(a[key]) - Number(b[key]));
const snapshot = (c: Conn) =>
  norm({ p: keyed(c, 'priority', 'householdId'), e: keyed(c, 'escalation', 'householdId'), k: keyed(c, 'checkin', 'householdId'), d: keyed(c, 'disaster', 'id'), o: keyed(c, 'overrideLog', 'id') });

async function rejected(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

async function main() {
  const dispatcher = await connect('dispatcher');
  const observer = await connect('observer');
  const A = dispatcher.conn;
  const B = observer.conn;
  check('two clients connected with different identities', dispatcher.identity !== observer.identity, `${dispatcher.identity.slice(0, 8)}… / ${observer.identity.slice(0, 8)}…`);

  // An anonymous connection is issued a NEW identity every time. The dashboard saves its token in
  // localStorage so a reload keeps the same identity; without that, promoting a browser would not stick.
  const anon = await connect('anonymous');
  const anonIdentity = anon.identity;
  anon.conn.disconnect();
  const fresh = await connect('anonymous-again');
  const freshIdentity = fresh.identity;
  fresh.conn.disconnect();
  const resumed = await connect('anonymous-resumed', anon.token);
  check('a reconnect WITHOUT the saved token gets a different identity (why the token must be kept)', freshIdentity !== anonIdentity);
  check('a reconnect WITH the saved token keeps the same identity, so a promotion survives a reload', resumed.identity === anonIdentity, `${resumed.identity.slice(0, 8)}…`);
  resumed.conn.disconnect();

  // The CLI identity published the module, so it is the owner/operator. It promotes the dispatcher client.
  execFileSync('spacetime', ['call', DB, 'add_operator', '--server', SERVER, '--', JSON.stringify([`0x${dispatcher.identity}`])], { stdio: 'pipe' });
  check('owner promoted the dispatcher client to operator', true);

  // Authorization from a real, separate client identity.
  const denied = await rejected(B.reducers.simQuake({ ...ALDER, magnitude: 1 }));
  check('observer cannot trigger a simulation', denied !== null && /dispatchers/.test(denied), denied ?? 'NOT REJECTED');

  await A.reducers.simReset({});
  await until('both clients see the reset neighborhood', () => rows(A, 'household').length === 40 && rows(B, 'household').length === 40);
  const alvarez = rows(A, 'household').find((h) => h.name === 'Mrs. Alvarez');
  const tran = rows(A, 'household').find((h) => h.name === 'Mr. Tran');
  check('both clients hold 40 synthetic households and no active disaster', rows(B, 'disaster').length === 0);

  const auditBefore = rows(B, 'overrideLog').length;
  const noReason = await rejected(A.reducers.overridePriority({ householdId: tran.id, delta: 10, reason: '   ' }));
  check('dispatcher override without a reason is refused', noReason !== null && /reason/i.test(noReason), noReason ?? 'NOT REJECTED');
  const nan = await rejected(A.reducers.overridePriority({ householdId: tran.id, delta: NaN, reason: 'x' }));
  check('dispatcher override with NaN is refused', nan !== null, nan ?? 'NOT REJECTED');
  await sleep(300);
  check('refused overrides left no audit row', rows(B, 'overrideLog').length === auditBefore);

  // The scenario. Everything below is observed from the OBSERVER's own subscription.
  await A.reducers.simQuake({ ...ALDER, magnitude: 1.0 });
  await A.reducers.simPowerLoss({ ...ALDER, radius: 160 });
  await until('observer sees the quake', () => rows(B, 'disaster').some((d) => d.kind === 'quake' && d.active));
  check('observer sees the confirmed quake through its own subscription', true);
  await until('observer sees Alvarez check-in pending', () => rows(B, 'checkin').find((c) => c.householdId === alvarez.id)?.state === 'pending');
  const timelineB = () => rows(B, 'timeline').map((t) => t.message);
  check('observer sees the timeline entry "Earthquake CONFIRMED"', timelineB().some((m: string) => m.startsWith('Earthquake CONFIRMED')));

  await A.reducers.simFastForward({ minutes: 4 });
  await until('observer sees Alvarez at step 2 / no_response', () => {
    const e = rows(B, 'escalation').find((x) => x.householdId === alvarez.id);
    const c = rows(B, 'checkin').find((x) => x.householdId === alvarez.id);
    return e?.step === 2 && c?.state === 'no_response';
  });
  const p = rows(B, 'priority').find((x) => x.householdId === alvarez.id);
  check('observer sees Mrs. Alvarez ranked #1 with a plain-English reason', p.rank === 1 && p.reason.includes('oxygen concentrator'), `HPI ${p.hpi}, "${p.reason}"`);

  // Override from the dispatcher; the observer must receive it and the audit row.
  await A.reducers.overridePriority({ householdId: tran.id, delta: 10, reason: 'Neighbor reports he uses a walker (simulated)' });
  await until('observer sees the audit row', () => rows(B, 'overrideLog').length === auditBefore + 1);
  const audit = rows(B, 'overrideLog').at(-1);
  check('override is audited (who, why, how much) and synced', audit.delta === 10 && audit.reason.includes('walker') && typeof audit.by === 'string' && audit.by.length > 0, `by ${audit.by}`);
  const deniedOverride = await rejected(B.reducers.overridePriority({ householdId: tran.id, delta: 30, reason: 'observer trying' }));
  check('observer cannot override priority', deniedOverride !== null && /dispatchers/.test(deniedOverride), deniedOverride ?? 'NOT REJECTED');
  const deniedFinal = await rejected(B.reducers.setFinalState({ householdId: alvarez.id, state: 'found_ok', note: 'observer trying' }));
  check('observer cannot mark a household found OK', deniedFinal !== null && /dispatchers/.test(deniedFinal), deniedFinal ?? 'NOT REJECTED');
  const deniedCheckin = await rejected(B.reducers.submitCheckin({ householdId: alvarez.id, answer: 'ok', source: 'phone' }));
  check('observer cannot answer a check-in for a household it does not own', deniedCheckin !== null, deniedCheckin ?? 'NOT REJECTED');

  // Both clients must converge on identical state. The 5 s tick keeps writing, so retry briefly.
  let same = false;
  for (let i = 0; i < 60 && !same; i++) {
    await sleep(100);
    same = snapshot(A) === snapshot(B);
  }
  check('dispatcher and observer hold identical priority, escalation, check-in, disaster and audit tables', same);

  // Fast-forward to the end: everyone reachable should be accounted for, as seen by the observer.
  await A.reducers.simFastForward({ minutes: 60 });
  const accounted = () => rows(B, 'household').filter((h) => h.finalState !== 'unresolved').length;
  await until('observer sees 38 of 40 accounted for', () => accounted() === 38, 15000);
  check('observer sees 38 of 40 accounted for; the 2 unsensored homes stay unknown', rows(B, 'priority').filter((x) => !x.scored && x.band === 'unknown').length === 2);
  const alvarezFinal = rows(B, 'household').find((h) => h.id === alvarez.id).finalState;
  check('Mrs. Alvarez ends Assisted', alvarezFinal === 'assisted', alvarezFinal);

  await A.reducers.simReset({});
  await until('reset reaches observer', () => rows(B, 'disaster').length === 0);

  // Clean up: this run's dispatcher identity is ephemeral, so leaving it an operator would
  // accumulate dead dispatchers on the database. The owner (the CLI identity) removes it.
  execFileSync('spacetime', ['call', DB, 'remove_operator', '--server', SERVER, '--', JSON.stringify([`0x${dispatcher.identity}`])], { stdio: 'pipe' });
  check('this run\'s temporary dispatcher was removed again', true);

  A.disconnect();
  B.disconnect();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed against ${DB} @ ${URI}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error('verify-live aborted:', e instanceof Error ? e.message : e);
  process.exit(2);
});
