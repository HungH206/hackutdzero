import { createServer } from 'node:http';
import type { Agent } from './agent.ts';
import type { Store } from './store.ts';
import type { Db, Language } from './types.ts';

const E164 = /^\+[1-9]\d{7,14}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface AdminOptions {
  port: number;
  db: Db;
  store: Store;
  agent: Agent;
  assign: ((handle: string) => Promise<string>) | null;
}

const escapeHtml = (v: unknown) => String(v).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const PAGE = (body: string) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Headcount agent</title><meta http-equiv="refresh" content="3">
<style>:root{color-scheme:light}body{font:15px/1.45 -apple-system,system-ui,sans-serif;margin:0 auto;max-width:760px;padding:24px 16px;color:#1c1c1e;background:#fff}h1{font-size:40px;margin:0;letter-spacing:-.02em}h2{font-size:15px;margin:28px 0 8px}table{border-collapse:collapse;width:100%}td,th{border-top:1px solid #e5e5ea;padding:8px 6px;text-align:left;font-weight:400;vertical-align:top}th{color:#6e6e73;font-size:13px}input,select,button{font:inherit;padding:6px 8px}button{cursor:pointer}form.row{display:flex;flex-wrap:wrap;gap:6px}p.sub{color:#6e6e73;margin:4px 0 0}</style>${body}`;

export function startAdmin({ port, db, store, assign }: AdminOptions) {
  createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (req.method === 'POST') {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        const form = new URLSearchParams(raw);
        if (url.pathname === '/approve') {
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
      const s = await db.snapshot();
      const c = s.summary;
      const name = (id: number) => s.households.find((h) => h.id === id)?.name ?? id;
      const proposals = s.tasks.filter((t) => t.state === 'proposed').map((t) => `<tr><td>${escapeHtml(name(t.householdId))}<br><small>${escapeHtml(t.reason)}</small></td><td>${escapeHtml(t.helperLabel)}</td><td><form method="post" action="/approve"><input type="hidden" name="id" value="${escapeHtml(t.id)}"><button>Approve</button></form></td></tr>`).join('');
      const tasks = s.tasks.filter((t) => t.state !== 'proposed').map((t) => `<tr><td>${escapeHtml(name(t.householdId))}</td><td>${escapeHtml(t.state)}</td><td>${escapeHtml(t.helperLabel)}</td></tr>`).join('');
      const people = store.contacts().map((p) => `<tr><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.householdId ?? '-')} / ${escapeHtml(p.careFor.join(', ') || '-')}</td><td>${p.assignedNumber ? `Texts ${escapeHtml(p.assignedNumber)}` : 'No line'}</td><td>${p.spaceId ? 'Joined' : 'Waiting for first text'}</td><td>${escapeHtml(p.capabilities.join(', '))}</td></tr>`).join('');
      const options = s.households.slice().sort((a, b) => a.id - b.id).map((h) => `<option value="${h.id}">${h.id} ${escapeHtml(h.name)} (${escapeHtml(h.unit)})</option>`).join('');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(PAGE(`
<h1>${c?.eventActive ? `${c.accounted} of ${c.total} accounted for` : 'All clear'}</h1>
<p class="sub">${c?.eventActive ? `${c.reported} reported, unconfirmed. ${c.needsHelp} need help. ${c.conflict} conflicting. ${c.unaccounted} no word.` : 'No active emergency.'}</p>
<h2>Waiting for your approval</h2><table>${proposals || '<tr><td>Nothing waiting.</td></tr>'}</table>
<h2>Neighbor checks</h2><table>${tasks || '<tr><td>None yet.</td></tr>'}</table>
<h2>People on the line</h2><table><tr><th>Name</th><th>Home / cares for</th><th>Line</th><th>Status</th><th>Can offer</th></tr>${people}</table>
<h2>Add someone</h2><form class="row" method="post" action="/enroll"><input name="name" placeholder="Name" required><input name="handle" placeholder="+14155550123" required><select name="household"><option value="">Lives elsewhere</option>${options}</select><input name="careFor" placeholder="Cares for ids, like 1,4"><select name="language"><option value="en">English</option><option value="es">Spanish</option></select><button>Add</button></form>`));
    } catch (error) {
      res.writeHead(400, { 'content-type': 'text/plain' }).end(error instanceof Error ? error.message : 'Failed');
    }
  }).listen(port, '127.0.0.1', () => console.log(`Dispatcher page: http://127.0.0.1:${port}`));
}
