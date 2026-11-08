import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { startAdmin } from './admin.ts';
import { Agent } from './agent.ts';
import { assignLine, photonClient, photonSend, subscribe } from './photon.ts';
import { SpacetimeHttp } from './spacetime.ts';
import { Store } from './store.ts';
import { keywordUnderstand, modelUnderstand } from './understand.ts';
import type { Send, Understand } from './types.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;
if (!env.SPACETIME_TOKEN) throw new Error('Set SPACETIME_TOKEN. Run scripts/setup-local.sh first.');

const store = new Store(path.join(here, '../data/state.json'));
const db = new SpacetimeHttp(env.SPACETIME_URL ?? 'http://127.0.0.1:3000', env.SPACETIME_DB ?? 'headcount', env.SPACETIME_TOKEN);

const understand: Understand = env.ANTHROPIC_API_KEY
  ? modelUnderstand(new Anthropic(), env.HEADCOUNT_MODEL ?? 'claude-opus-5-5')
  : async (ctx) => keywordUnderstand(ctx);
if (!env.ANTHROPIC_API_KEY) console.warn('ANTHROPIC_API_KEY is not set. Using keyword matching.');

const live = Boolean(env.PHOTON_API_KEY && env.PHOTON_PROJECT_ID);
const photon = live ? photonClient(env.PHOTON_API_KEY!) : null;
const send: Send = photon ? photonSend(photon, env.PHOTON_PROJECT_ID!) : async (to, text) => console.log(`(not sent, no Photon key) to ${to.name}: ${text}`);
if (!live) console.warn('PHOTON_API_KEY or PHOTON_PROJECT_ID is not set. Texts are printed only.');

const agent = new Agent({ db, store, send, understand });
if (live) subscribe(env.PHOTON_PROJECT_ID!, env.PHOTON_API_KEY!, store, (m) => agent.handle(m));
startAdmin({ port: Number(env.ADMIN_PORT ?? 8787), db, store, agent, assign: photon ? (h) => assignLine(photon, env.PHOTON_PROJECT_ID!, h) : null });

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
