// Plays the demo against a real local SpacetimeDB with a fake phone network. Needs `spacetime start`.
// Usage: npm run e2e
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { Agent } from '../src/agent.ts';
import { SpacetimeHttp } from '../src/spacetime.ts';
import { Store } from '../src/store.ts';
import { keywordUnderstand } from '../src/understand.ts';
import type { Contact, Inbound } from '../src/types.ts';

const URL_ = 'http://127.0.0.1:3000';
const DB = 'headcount-e2e';
const run = (...args: string[]) => execFileSync('spacetime', args, { stdio: 'pipe' }).toString();

run('publish', '--server', 'local', '--module-path', '../spacetimedb', '--delete-data=always', '-y', DB);
const id = (await (await fetch(`${URL_}/v1/identity`, { method: 'POST' })).json()) as { identity: string; token: string };
run('call', '--server', 'local', '-y', DB, 'add_operator', JSON.stringify({ __identity__: `0x${id.identity}` }));

const db = new SpacetimeHttp(URL_, DB, id.token);
const store = new Store(null);
const outbox: { to: string; text: string }[] = [];
let clock = 1_000_000;
const agent = new Agent({ db, store, understand: async (c) => keywordUnderstand(c), now: () => clock, send: async (to: Contact, text: string) => { outbox.push({ to: to.name, text }); } });

let s = await db.snapshot();
const byName = (n: string) => s.households.find((h) => h.name === n)!;
const alvarez = byName('Mrs. Alvarez');
const brooks = byName('J. Brooks');
const patel = byName('The Patel family');
store.upsert({ handle: '+15550000001', name: 'Rosa', householdId: patel.id, careFor: [], language: 'en', assignedNumber: null });
store.upsert({ handle: '+15550000002', name: 'Jay', householdId: brooks.id, careFor: [], language: 'en', assignedNumber: null });
store.upsert({ handle: '+15550000003', name: 'Elena', householdId: null, careFor: [alvarez.id], language: 'en', assignedNumber: null });
store.upsert({ handle: '+15550000004', name: 'Ana', householdId: alvarez.id, careFor: [], language: 'en', assignedNumber: null });

let n = 0;
const text = async (handle: string, body: string) => agent.handle({ id: `m${++n}`, handle, spaceId: `pho_spc_${handle}`, agentId: 'pho_usr_agent', text: body } satisfies Inbound);
const last = (who: string) => outbox.filter((m) => m.to === who).at(-1)?.text ?? '';
const account = async (id: number) => { s = await db.snapshot(); return s.accounts.find((a) => a.householdId === id); };
const step = (label: string) => console.log(`ok  ${label}`);

await text('+15550000001', 'hi'); assert.match(last('Rosa'), /normal day/);
await text('+15550000001', 'I have a truck and a generator'); assert.deepEqual(store.contact('+15550000001')!.capabilities, ['truck', 'generator']);
await text('+15550000002', 'hi'); await text('+15550000002', 'nothing');
await text('+15550000003', 'hi'); await text('+15550000003', 'nothing');
await text('+15550000004', 'hi'); await text('+15550000004', 'nothing');
step('setup over text');

await agent.tick();
s = await db.snapshot();
assert.equal(s.households.find((h) => h.id === alvarez.id)!.simBehavior, 'agent');
step('households linked');

run('call', '--server', 'local', '-y', DB, 'sim_quake', '225', '175', '1.5');
await agent.tick();
assert.match(last('Ana'), /Are you OK/); assert.match(last('Jay'), /Are you OK/);
assert.match(last('Elena'), /trying to reach Mrs\. Alvarez/);
const before = outbox.length; await agent.tick(); assert.equal(outbox.length, before, 'a second tick must not text anyone again');
step('check-ins sent once');

await text('+15550000002', "I'm ok");
assert.equal((await account(brooks.id))?.status, 'accounted'); assert.match(last('Jay'), /accounted for/);
await text('+15550000001', 'all good here');
step('direct replies count');

await text('+15550000003', "she's at dialysis today");
assert.equal((await account(alvarez.id))?.status, 'reported');
assert.match(last('Elena'), /unconfirmed/);
step('hearsay stays unconfirmed for a high-risk person');

await text('+15550000004', 'no puedo salir, mi pierna');
assert.equal((await account(alvarez.id))?.status, 'needs_help');
assert.match(last('Ana'), /no puedo|coordina/i); assert.doesNotMatch(last('Ana'), /aceptó ir/);
await agent.tick();
s = await db.snapshot();
const task = s.tasks.find((t) => t.householdId === alvarez.id)!;
assert.equal(task.state, 'proposed');
const asked = outbox.length; await agent.tick(); assert.equal(outbox.length, asked, 'nobody is asked before a human approves');
step('help request proposes a task and waits for a person');

await db.approveTask(task.id, 'Dispatcher');
await agent.tick();
assert.match(last('Jay') + last('Rosa'), /knock at Alder Court, unit 1A/);
const helperName = /knock/.test(last('Jay')) ? 'Jay' : 'Rosa';
const helperHandle = helperName === 'Jay' ? '+15550000002' : '+15550000001';
const other = helperName === 'Jay' ? 'Rosa' : 'Jay';
assert.doesNotMatch(last(helperName), /Alvarez|oxygen/);
step(`nearest confirmed-safe neighbor asked (${helperName}), no name or medical details`);

await text(helperHandle, 'no sorry');
await agent.tick();
assert.match(last(other), /knock at/);
step('a no moves to the next person');

const otherHandle = other === 'Jay' ? '+15550000002' : '+15550000001';
await text(otherHandle, 'on my way');
assert.match(last('Ana'), /aceptó ir/); assert.match(last('Elena'), /agreed to go check/); assert.match(last(other), /Ask for Mrs\. Alvarez/);
step('accept tells the person and the family only after the row exists');

clock += 300_000; await agent.tick(); assert.match(last(other), /Were you able to reach/);
step('follow-up sent');

await text(otherHandle, 'she is fine');
assert.equal((await account(alvarez.id))?.status, 'accounted');
assert.match(last('Elena'), /saw Mrs\. Alvarez in person/);
s = await db.snapshot();
assert.equal(s.tasks.find((t) => t.id === task.id)!.state, 'done');
step('in-person check closes it');

console.log(`\nAccounted ${s.summary!.accounted} of ${s.summary!.total}. ${outbox.length} texts sent.`);
