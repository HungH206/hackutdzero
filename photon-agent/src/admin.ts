import { createServer } from 'node:http';
import type { Agent } from './agent.ts';
import type { Store } from './store.ts';
import type { Db, Language, Snapshot } from './types.ts';

const E164 = /^\+[1-9]\d{7,14}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface AdminOptions {
  port: number;
  db: Db;
  store: Store;
  agent: Agent;
  assign: ((handle: string) => Promise<string>) | null;
  /** Runs a message through the agent as if that person had texted it. Replies come back instead of being sent. */
  chat?: (handle: string, text: string) => Promise<{ replies: { to: string; text: string }[]; source: string }>;
  /** Texts a dispatcher's announcement to everyone who has joined. */
  announce?: (text: string) => Promise<{ sent: number; skipped: number }>;
  /** A short dispatcher briefing for the current state, never waiting on the model. */
  briefing?: (s: Snapshot) => { headline: string; next: string[]; source: string; updating: boolean };
  /** Drafts an announcement for the dispatcher to edit. Never sends anything. */
  draft?: () => Promise<{ text: string; source: string }>;
}

const PRESETS: [string, string][] = [
  ['Quake, we\'re ok', 'The earthquake just hit. We are ok but the power is out.'],
  ['Mom at dialysis', 'My mom Mrs. Alvarez is at dialysis right now. I have not heard from her.'],
  ['Needs help', 'Mrs. Alvarez in 1A needs help. She is on oxygen and the power is out.'],
  ['I can help', 'I am ok. I have a generator and a first aid kit I can share.'],
  ['Yes I\'ll go', 'Yes, I can go check on her.'],
  ['Español', 'Estoy bien. Tengo un generador y puedo ayudar.'],
];

const escapeHtml = (v: unknown) => String(v).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const NAV = (here: 'home' | 'chat') => `<nav style="display:flex;gap:16px;margin-bottom:18px;font-size:14px"><a href="/" style="${here === 'home' ? 'font-weight:600;color:#1c1c1e' : 'color:#6e6e73'};text-decoration:none">Dispatcher</a><a href="/chat" style="${here === 'chat' ? 'font-weight:600;color:#1c1c1e' : 'color:#6e6e73'};text-decoration:none">Chat test</a></nav>`;

const PAGE = (body: string, refresh = true) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Headcount agent</title>${refresh ? `<script>setInterval(()=>{const a=document.activeElement;if((a&&/INPUT|SELECT|TEXTAREA/.test(a.tagName))||[...document.querySelectorAll('input[name=name],input[name=handle],input[name=careFor],textarea')].some(i=>i.value))return;location.reload()},3000)</script>` : ''}
<style>:root{color-scheme:light}body{font:15px/1.45 -apple-system,system-ui,sans-serif;margin:0 auto;max-width:760px;padding:24px 16px;color:#1c1c1e;background:#fff}h1{font-size:40px;margin:0;letter-spacing:-.02em}h2{font-size:15px;margin:28px 0 8px}table{border-collapse:collapse;width:100%}td,th{border-top:1px solid #e5e5ea;padding:8px 6px;text-align:left;font-weight:400;vertical-align:top}th{color:#6e6e73;font-size:13px}input,select,button{font:inherit;padding:6px 8px}button{cursor:pointer}form.row{display:flex;flex-wrap:wrap;gap:6px}p.sub{color:#6e6e73;margin:4px 0 0}</style>${body}`;

interface Exchange { who: string; text: string; source: string; replies: { to: string; text: string }[] }

export function startAdmin({ port, db, store, assign, chat, announce, briefing, draft }: AdminOptions) {
  const history: Exchange[] = [];
  let lastAnnounce = '';
  createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (req.method === 'POST') {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        const form = new URLSearchParams(raw);
        if (url.pathname === '/chat') {
          if (!chat) throw new Error('Chat test is not available.');
          const handle = form.get('handle') ?? '';
          const text = (form.get('text') ?? '').trim();
          const person = store.contact(handle);
          if (!person || !text) throw new Error('Pick a person and type a message.');
          const result = await chat(handle, text);
          history.unshift({ who: person.name, text, ...result });
          history.length = Math.min(history.length, 30);
          res.writeHead(303, { Location: `/chat?who=${encodeURIComponent(handle)}` }).end();
          return;
        }
        if (url.pathname === '/draft') {
          if (!draft) throw new Error('Drafting is not available.');
          res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(await draft()));
          return;
        }
        if (url.pathname === '/announce') {
          if (!announce) throw new Error('Announcements are not available.');
          const text = (form.get('text') ?? '').trim();
          if (!text) throw new Error('Type the announcement first.');
          const r = await announce(text);
          lastAnnounce = `Sent to ${r.sent} ${r.sent === 1 ? 'person' : 'people'}${r.skipped ? `, ${r.skipped} skipped (not joined yet, stopped, or send failed)` : ''}.`;
        } else if (url.pathname === '/approve') {
          await db.approveTask(Number(form.get('id')), 'Dispatcher');
        } else if (url.pathname === '/enroll') {
          const handle = (form.get('handle') ?? '').trim();
          if (!E164.test(handle) && !EMAIL.test(handle)) throw new Error('Use a phone like +14155550123 or an iMessage email.');
          const household = form.get('household') ? Number(form.get('household')) : null;
          const careFor = (form.get('careFor') ?? '').split(',').map((v) => v.trim()).filter(Boolean).map(Number);
          const assignedNumber = assign ? await assign(handle) : null;
          store.upsert({ handle, name: (form.get('name') ?? 'there').trim() || 'there', householdId: household, careFor, language: (form.get('language') as Language) || 'en', assignedNumber });
        }
        res.writeHead(303, { Location: '/' }).end();
        return;
      }
      if (url.pathname === '/chat') {
        const who = url.searchParams.get('who') ?? '';
        const people = store.contacts().map((p) => `<option value="${escapeHtml(p.handle)}"${p.handle === who ? ' selected' : ''}>${escapeHtml(p.name)}${p.householdId ? ` (home ${escapeHtml(p.householdId)})` : ''}</option>`).join('');
        const presets = PRESETS.map(([label, text]) => `<button type="button" data-t="${escapeHtml(text)}" onclick="document.querySelector('textarea').value=this.dataset.t">${escapeHtml(label)}</button>`).join(' ');
        const log = history.map((x) => `<div style="border-top:1px solid #e5e5ea;padding:10px 0"><b>${escapeHtml(x.who)}</b> <small style="color:#6e6e73">[${escapeHtml(x.source)}]</small><div>${escapeHtml(x.text)}</div>${x.replies.map((r) => `<div style="margin:6px 0 0 14px;color:#0a5"><small>to ${escapeHtml(r.to)}:</small> ${escapeHtml(r.text)}</div>`).join('') || '<div style="margin:6px 0 0 14px;color:#6e6e73"><small>No reply.</small></div>'}</div>`).join('');
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(PAGE(`${NAV('chat')}
<h1>Chat test</h1>
<p class="sub">Type as one of the people below. The agent reads it the same way as a real text and saves real reports to the database. Replies show here and are not texted.</p>
<form method="post" action="/chat" style="margin-top:16px"><div class="row" style="display:flex;gap:6px;margin-bottom:8px"><select name="handle">${people}</select></div>
<div style="margin-bottom:8px;display:flex;flex-wrap:wrap;gap:6px">${presets}</div>
<textarea name="text" rows="3" required placeholder="Type an emergency message" style="width:100%;box-sizing:border-box;font:inherit;padding:8px"></textarea>
<div style="margin-top:8px"><button>Send</button></div></form>
<h2>Conversation</h2>${log || '<p class="sub">Nothing yet.</p>'}`, false));
        return;
      }
      const s = await db.snapshot();
      const c = s.summary;
      const name = (id: number) => s.households.find((h) => h.id === id)?.name ?? id;
      const proposals = s.tasks.filter((t) => t.state === 'proposed').map((t) => `<tr><td>${escapeHtml(name(t.householdId))}<br><small>${escapeHtml(t.reason)}</small></td><td>${escapeHtml(t.helperLabel)}</td><td><form method="post" action="/approve"><input type="hidden" name="id" value="${escapeHtml(t.id)}"><button>Approve</button></form></td></tr>`).join('');
      const tasks = s.tasks.filter((t) => t.state !== 'proposed').map((t) => `<tr><td>${escapeHtml(name(t.householdId))}</td><td>${escapeHtml(t.state)}</td><td>${escapeHtml(t.helperLabel)}</td></tr>`).join('');
      const people = store.contacts().map((p) => `<tr><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.householdId ?? '-')} / ${escapeHtml(p.careFor.join(', ') || '-')}</td><td>${p.assignedNumber ? `Texts ${escapeHtml(p.assignedNumber)}` : 'No line'}</td><td>${p.spaceId ? 'Joined' : 'Waiting for first text'}</td><td>${escapeHtml(p.capabilities.join(', '))}</td></tr>`).join('');
      const options = s.households.slice().sort((a, b) => a.id - b.id).map((h) => `<option value="${h.id}">${h.id} ${escapeHtml(h.name)} (${escapeHtml(h.unit)})</option>`).join('');
      const b = briefing?.(s);
      const brief = b ? `<h2>Briefing <small style="color:#6e6e73;font-weight:400">${b.updating ? 'updating…' : b.source === 'model' ? 'Gemini' : 'rules'}</small></h2><p style="margin:0 0 6px">${escapeHtml(b.headline)}</p>${b.next.length ? `<ol style="margin:6px 0 0;padding-left:20px">${b.next.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ol>` : ''}` : '';
      const announceForm = announce ? `<h2>Announce</h2><form method="post" action="/announce" onsubmit="return confirm('Text this to everyone who has joined?')"><textarea name="text" rows="2" required placeholder="e.g. An earthquake was detected near Alder Court. Reply OK if you are safe." style="width:100%;box-sizing:border-box;font:inherit;padding:8px"></textarea><div style="margin-top:6px;display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button type="button" id="draftBtn" ${draft ? '' : 'hidden'} onclick="const b=this,t=document.querySelector('textarea[name=text]'),n=document.getElementById('draftNote');b.disabled=true;n.textContent='Drafting…';fetch('/draft',{method:'POST'}).then(r=>r.json()).then(d=>{t.value=d.text;n.textContent=d.source==='model'?'Drafted by Gemini. Edit it, then send.':'Template draft. Edit it, then send.'}).catch(()=>{n.textContent='Could not draft.'}).finally(()=>{b.disabled=false})">Draft with Gemini</button><button>Send to everyone who joined</button> <small id="draftNote" style="color:#6e6e73"></small> <small style="color:#6e6e73">${escapeHtml(lastAnnounce)}</small></div></form>` : '';
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(PAGE(`${NAV('home')}
<h1>${c?.eventActive ? `${c.accounted} of ${c.total} accounted for` : 'All clear'}</h1>
<p class="sub">${c?.eventActive ? `${c.reported} reported, unconfirmed. ${c.needsHelp} need help. ${c.conflict} conflicting. ${c.unaccounted} no word.` : 'No active emergency.'}</p>
${brief}
<h2>Waiting for your approval</h2><table>${proposals || '<tr><td>Nothing waiting.</td></tr>'}</table>
<h2>Neighbor checks</h2><table>${tasks || '<tr><td>None yet.</td></tr>'}</table>
${announceForm}
<h2>People on the line</h2><table><tr><th>Name</th><th>Home / cares for</th><th>Line</th><th>Status</th><th>Can offer</th></tr>${people}</table>
<h2>Add someone</h2><form class="row" method="post" action="/enroll"><input name="name" placeholder="Name" required><input name="handle" placeholder="+14155550123" required><select name="household"><option value="">Lives elsewhere</option>${options}</select><input name="careFor" placeholder="Cares for ids, like 1,4"><select name="language"><option value="en">English</option><option value="es">Spanish</option></select><button>Add</button></form>`));
    } catch (error) {
      res.writeHead(400, { 'content-type': 'text/plain' }).end(error instanceof Error ? error.message : 'Failed');
    }
  }).listen(port, '127.0.0.1', () => console.log(`Dispatcher page: http://127.0.0.1:${port}`));
}
