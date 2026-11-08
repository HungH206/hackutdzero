import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startAdmin } from './admin.ts';
import { Agent } from './agent.ts';
import { Briefing, answerDispatcher, draftAnnouncement } from './briefing.ts';
import { geminiLlm } from './llm.ts';
import { assignLine, photonClient, photonSend, subscribe } from './photon.ts';
import { SpacetimeHttp } from './spacetime.ts';
import { Store } from './store.ts';
import { keywordUnderstand, modelTranslate, modelUnderstand } from './understand.ts';
import { Voice, callSummary, startVoiceServer } from './voice.ts';
import type { Send, Snapshot, Understand } from './types.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;
if (!env.SPACETIME_TOKEN) throw new Error('Set SPACETIME_TOKEN. Run scripts/setup-local.sh first.');

const adminHost = env.ADMIN_HOST ?? '127.0.0.1';
if (adminHost !== '127.0.0.1' && !env.ADMIN_TOKEN) throw new Error('Set ADMIN_TOKEN before exposing the dispatcher server.');
const store = new Store(env.STATE_FILE ?? path.join(here, '../data/state.json'));
const messagingEnabled = env.PHOTON_SEND_ENABLED === 'true';
const db = new SpacetimeHttp(env.SPACETIME_URL ?? 'http://127.0.0.1:3000', env.SPACETIME_DB ?? 'headcount', env.SPACETIME_TOKEN);

const llm = env.GEMINI_API_KEY ? geminiLlm(env.GEMINI_API_KEY, env.HEADCOUNT_MODEL ?? 'gemini-3.5-flash') : null;
const understand: Understand = llm
  ? modelUnderstand(llm)
  : async (ctx) => keywordUnderstand(ctx);
if (!llm) console.warn('GEMINI_API_KEY is not set. Using keyword matching.');

const live = messagingEnabled && Boolean(env.PHOTON_API_KEY && env.PHOTON_PROJECT_ID);
const photon = live ? photonClient(env.PHOTON_API_KEY!) : null;
const send: Send = photon ? photonSend(photon, env.PHOTON_PROJECT_ID!) : async (to, text) => console.log(`(not sent, no Photon key) to ${to.name}: ${text}`);
if (!live) console.warn('Messaging is disabled. Texts are printed only. Enable PHOTON_SEND_ENABLED only for an authorized phone test.');

const voice = messagingEnabled && env.RETELL_API_KEY && env.RETELL_AGENT_ID && env.VOICE_FROM_NUMBER && env.DISPATCHER_PHONE
  ? new Voice({
    apiKey: env.RETELL_API_KEY, agentId: env.RETELL_AGENT_ID, from: env.VOICE_FROM_NUMBER, dispatcher: env.DISPATCHER_PHONE, store, db,
    translate: llm ? modelTranslate(llm) : async (text) => text,
    summarize: llm ? callSummary(llm) : null,
    notify: (to, text, key, h) => agent.notify(to, text, key, h),
  })
  : null;
if (!voice) console.warn('Voice is off. Set RETELL_API_KEY, RETELL_AGENT_ID, VOICE_FROM_NUMBER and DISPATCHER_PHONE to turn it on.');

const dispatcherAsk = { ...(env.DISPATCHER_PHONE ? { dispatcherHandle: env.DISPATCHER_PHONE } : {}), answerDispatcher: (s: Snapshot, q: string) => answerDispatcher(llm, s, q) };
const agent: Agent = new Agent({ db, store, send, understand, ...dispatcherAsk, ...(voice ? { voice } : {}) });
if (voice) startVoiceServer(voice, env.RETELL_API_KEY!, Number(env.VOICE_PORT ?? 8788));
if (live) subscribe(env.PHOTON_PROJECT_ID!, env.PHOTON_API_KEY!, store, (m) => agent.handle(m));
const briefing = new Briefing(llm);

// Chat test: the same agent logic, but replies are captured instead of texted, so no real phone gets a message.
let captured: { to: string; text: string }[] = [];
let lastSource = 'none';
const sandbox = new Agent({
  db, store, ...dispatcherAsk,
  send: async (to, text) => { captured.push({ to: to.name, text }); },
  understand: async (ctx) => { const u = await understand(ctx); lastSource = u.source; return u; },
});
let chatQueue: Promise<unknown> = Promise.resolve();
const chat = (handle: string, text: string) => {
  const run = async () => {
    const person = store.contact(handle);
    if (!person) throw new Error('Unknown person.');
    const before = { spaceId: person.spaceId, agentId: person.agentId };
    captured = [];
    lastSource = 'none';
    try {
      await sandbox.handle({ id: `chat:${Date.now()}:${Math.random().toString(36).slice(2)}`, handle, spaceId: before.spaceId ?? 'chat-test', agentId: before.agentId ?? 'chat-test', text });
    } finally {
      store.patch(handle, before); // Never leave the test ids on a real contact.
    }
    return { replies: captured, source: lastSource };
  };
  const result = chatQueue.then(run, run);
  chatQueue = result.catch(() => undefined);
  return result;
};

startAdmin({ port: Number(env.PORT ?? env.ADMIN_PORT ?? 8787), host: adminHost, adminToken: env.ADMIN_TOKEN, db, store, agent, assign: photon ? (h) => assignLine(photon, env.PHOTON_PROJECT_ID!, h) : null, chat, announce: (text, building) => agent.announce(text, building), allowedOrigins: (env.ADMIN_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173').split(',').map((o) => o.trim()).filter(Boolean), briefing: (s) => briefing.get(s), draft: async () => draftAnnouncement(llm, await db.snapshot()) });

let running = false;
setInterval(async () => {
  if (running) return;
  running = true;
  try {
    await agent.tick();
  } catch (error) {
    console.error('Tick failed:', error instanceof Error ? error.message : error);
  } finally {
    running = false;
  }
}, 2000);
