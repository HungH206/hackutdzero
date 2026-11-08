import { useEffect, useState } from 'react';
import { useHeadcount } from '../../data/HeadcountProvider';
import './agent-screen.css';

// Neighborhood agent: who the text agent still needs to hear from, grouped by neighborhood, and the
// controls to message them. Reads the same database as every other screen. Messages go out through the
// text agent's local server (it holds the phone numbers; the database never does), so the buttons are off
// when that server is not running.

const AGENT = (import.meta.env.VITE_AGENT_URL ?? 'http://127.0.0.1:8787').replace(/\/$/, '');

const EVACUATE =
  'THIS IS AN EMERGENCY. A fire hazard or storm is in close proximity to your neighborhood. Please evacuate this area now. Reply OK if you are safe, or HELP if you need help.';

const STATUS_LABEL: Record<string, string> = {
  needs_help: 'Needs help',
  conflict: 'Conflicting reports',
  unaccounted: 'No word yet',
  reported: 'Reported OK, unconfirmed',
};
const STATUS_TONE: Record<string, string> = { needs_help: 'critical', conflict: 'waiting', unaccounted: 'unknown', reported: 'assisted' };
const ORDER = ['needs_help', 'conflict', 'unaccounted', 'reported'];
const TASK_LABEL: Record<string, string> = {
  proposed: 'Waiting for approval',
  approved: 'Approved, asking a neighbor',
  asked: 'Neighbor asked',
  accepted: 'Neighbor on the way',
};

type Link = { state: 'checking' } | { state: 'up'; joined: number } | { state: 'down' };

function useAgentLink(): Link {
  const [link, setLink] = useState<Link>({ state: 'checking' });
  useEffect(() => {
    let alive = true;
    const ping = async () => {
      try {
        const r = await fetch(`${AGENT}/api/status`, { headers: { accept: 'application/json' } });
        const j = (await r.json()) as { joined: number };
        if (alive) setLink({ state: 'up', joined: j.joined });
      } catch {
        if (alive) setLink({ state: 'down' });
      }
    };
    void ping();
    const id = setInterval(ping, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  return link;
}

export function AgentScreen() {
  const { snapshot, actions } = useHeadcount();
  const link = useAgentLink();
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sum = snapshot.summaries?.[0];
  const active = Boolean(sum?.eventActive);
  const accounts = new Map((snapshot.accounts ?? []).map((a) => [a.householdId, a]));
  const tasks = (snapshot.helpTasks ?? []).filter((t) => t.state !== 'done' && t.state !== 'cancelled');
  const up = link.state === 'up';

  const groups = snapshot.buildings
    .map((b) => {
      const homes = snapshot.households.filter((h) => h.buildingId === b.id);
      const attention = homes
        .map((h) => ({ h, a: accounts.get(h.id) }))
        .filter((x): x is { h: typeof x.h; a: NonNullable<typeof x.a> } => Boolean(x.a) && ORDER.includes(x.a!.status))
        .sort((x, y) => ORDER.indexOf(x.a.status) - ORDER.indexOf(y.a.status));
      const bt = tasks.filter((t) => homes.some((h) => h.id === t.householdId));
      return { b, homes, attention: active ? attention : [], tasks: bt };
    })
    .filter((g) => g.homes.length > 0)
    .sort((x, y) => y.attention.length + y.tasks.length - (x.attention.length + x.tasks.length));

  const draft = async () => {
    setBusy('draft');
    setError(null);
    setNote('');
    try {
      const r = await fetch(`${AGENT}/draft`, { method: 'POST', headers: { accept: 'application/json' } });
      const j = (await r.json()) as { text: string; source: string };
      setText(j.text);
      setNote(j.source === 'model' ? 'Drafted by Gemini. Edit it, then send.' : 'Template draft. Edit it, then send.');
    } catch {
      setError('Could not reach the text agent to draft.');
    } finally {
      setBusy(null);
    }
  };

  const send = async (buildingId: number | null, scope: string) => {
    if (!text.trim() || !window.confirm(`Text this to ${scope}?\n\n${text.trim()}`)) return;
    setBusy(`send-${buildingId ?? 'all'}`);
    setError(null);
    setNote('');
    try {
      const body = new URLSearchParams({ text: text.trim() });
      if (buildingId !== null) body.set('building', String(buildingId));
      const r = await fetch(`${AGENT}/announce`, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' }, body });
      if (!r.ok) throw new Error(await r.text());
      const j = (await r.json()) as { sent: number; skipped: number };
      setNote(`Sent to ${j.sent} ${j.sent === 1 ? 'person' : 'people'} in ${scope}.${j.skipped ? ` ${j.skipped} skipped: not joined yet, stopped, or the send failed.` : ''}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const approve = async (id: number) => {
    setBusy(`approve-${id}`);
    setError(null);
    try {
      await actions.approveHelpTask(id, 'Dispatcher');
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setError(m.toLowerCase().includes('operator') ? 'Only a dispatcher can approve. Run `npm run promote` in /monitor and reload.' : m);
    } finally {
      setBusy(null);
    }
  };

  const where = (id: number) => {
    const h = snapshot.households.find((x) => x.id === id);
    return h ? `${h.name}, unit ${h.unit}` : `Household ${id}`;
  };

  return (
    <div className="agents">
      <header className="agents__head">
        <div>
          <p className="agents__kicker">Neighborhood agent</p>
          <h1 className="agents__title">{active && sum ? `${sum.accounted} of ${sum.total} accounted for` : 'No active emergency'}</h1>
          <p className="agents__sub">
            {active && sum
              ? `${sum.reported} reported, unconfirmed. ${sum.needsHelp} need help. ${sum.conflict} conflicting. ${sum.unaccounted} no word.`
              : 'Who needs attention appears here once an event starts. You can still message neighbors below.'}
          </p>
        </div>
        <span className={`agents__link agents__link--${link.state}`} role="status">
          {link.state === 'up' ? `Agent connected. ${link.joined} ${link.joined === 1 ? 'person has' : 'people have'} joined.` : link.state === 'down' ? 'Agent not reachable. Run `npm start` in photon-agent.' : 'Checking the agent…'}
        </span>
      </header>

      <section className="agents__card" aria-label="Message">
        <h2 className="agents__kicker">Message</h2>
        <textarea
          className="agents__text"
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write a message, draft one with Gemini, or use the evacuation wording."
        />
        <div className="agents__bar">
          <button className="hc-btn hc-btn--secondary" disabled={!up || busy === 'draft'} onClick={draft}>
            {busy === 'draft' ? 'Drafting…' : 'Draft with Gemini'}
          </button>
          <button className="hc-btn hc-btn--secondary" onClick={() => { setText(EVACUATE); setNote('Evacuation wording. Edit it, then send.'); }}>
            Evacuation wording
          </button>
          <button className="hc-btn hc-btn--primary" disabled={!up || !text.trim() || busy !== null} onClick={() => send(null, 'everyone who joined')}>
            Send to everyone
          </button>
        </div>
        {note && <p className="agents__note">{note}</p>}
        {error && <p className="agents__error" role="alert">{error}</p>}
      </section>

      <div className="agents__grid">
        {groups.map(({ b, homes, attention, tasks: bt }) => (
          <section key={b.id} className="agents__card" aria-label={b.name}>
            <div className="agents__bhead">
              <div>
                <h2 className="agents__bname">{b.name}</h2>
                <p className="agents__meta">
                  {active ? `${attention.length} need attention, ${homes.length - attention.length} accounted for` : `${homes.length} homes`}
                </p>
              </div>
              <button className="hc-btn hc-btn--sm hc-btn--secondary" disabled={!up || !text.trim() || busy !== null} onClick={() => send(b.id, b.name)}>
                Send to {b.name}
              </button>
            </div>

            {bt.length > 0 && (
              <ul className="agents__list">
                {bt.map((t) => (
                  <li key={t.id} className="agents__row">
                    <div className="agents__main">
                      <span className="agents__name">{where(t.householdId)}</span>
                      <span className="agents__meta">Neighbor check: {TASK_LABEL[t.state] ?? t.state}</span>
                    </div>
                    {t.state === 'proposed' && (
                      <button className="hc-btn hc-btn--sm hc-btn--primary" disabled={busy === `approve-${t.id}`} onClick={() => approve(t.id)}>
                        Approve
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {attention.length > 0 ? (
              <ul className="agents__list">
                {attention.map(({ h, a }) => (
                  <li key={h.id} className="agents__row">
                    <span className={`agents__dot agents__dot--${STATUS_TONE[a.status] ?? 'unknown'}`} aria-hidden="true" />
                    <div className="agents__main">
                      <span className="agents__name">{h.name}, unit {h.unit}</span>
                      <span className="agents__meta">{a.note || STATUS_LABEL[a.status] || a.status}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              active && bt.length === 0 && <p className="agents__meta">Everyone here is accounted for.</p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
