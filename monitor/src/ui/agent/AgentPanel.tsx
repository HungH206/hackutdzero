import { useState } from 'react';
import { useHeadcount } from '../../data/HeadcountProvider';
import './agent-panel.css';

// What the text agent knows, on the main dashboard: who is accounted for from what people
// reported by text, and neighbor checks waiting on a dispatcher. Read from the same database as
// everything else. It stays out of the way until an event is active or a check is open.

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

export function AgentPanel() {
  const { snapshot, actions } = useHeadcount();
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sum = snapshot.summaries?.[0];
  const tasks = (snapshot.helpTasks ?? []).filter((t) => t.state !== 'done' && t.state !== 'cancelled');
  if (!sum?.eventActive && tasks.length === 0) return null;

  const homes = new Map(snapshot.households.map((h) => [h.id, h]));
  const buildings = new Map(snapshot.buildings.map((b) => [b.id, b.name]));
  const label = (id: number) => {
    const h = homes.get(id);
    return h ? `${h.name}, ${buildings.get(h.buildingId) ?? 'unknown'} ${h.unit}` : `Household ${id}`;
  };
  const attention = (snapshot.accounts ?? [])
    .filter((a) => ORDER.includes(a.status))
    .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status))
    .slice(0, 6);
  const waiting = tasks.filter((t) => t.state === 'proposed').length;

  const approve = async (id: number) => {
    setBusy(id);
    setError(null);
    try {
      await actions.approveHelpTask(id, 'Dispatcher');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <aside className="agentp" aria-label="Neighbor agent">
      <button className="agentp__head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="agentp__kicker">Neighbor agent</span>
        <span className="agentp__title">
          {sum ? `${sum.accounted} of ${sum.total} accounted for` : 'Waiting for the agent'}
        </span>
        {waiting > 0 && <span className="agentp__badge">{waiting} to approve</span>}
      </button>

      {open && (
        <div className="agentp__body">
          {sum && (
            <p className="agentp__sub">
              {sum.reported} reported, unconfirmed. {sum.needsHelp} need help. {sum.conflict} conflicting. {sum.unaccounted} no word.
            </p>
          )}

          {tasks.length > 0 && (
            <section>
              <h3 className="agentp__kicker">Neighbor checks</h3>
              <ul className="agentp__list">
                {tasks.map((t) => (
                  <li key={t.id} className="agentp__row">
                    <div className="agentp__main">
                      <span className="agentp__name">{label(t.householdId)}</span>
                      <span className="agentp__meta">{TASK_LABEL[t.state] ?? t.state}</span>
                    </div>
                    {t.state === 'proposed' && (
                      <button className="hc-btn hc-btn--sm hc-btn--primary" disabled={busy === t.id} onClick={() => approve(t.id)}>
                        Approve
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {attention.length > 0 && (
            <section>
              <h3 className="agentp__kicker">Needs attention</h3>
              <ul className="agentp__list">
                {attention.map((a) => (
                  <li key={a.householdId} className="agentp__row">
                    <span className={`agentp__dot agentp__dot--${STATUS_TONE[a.status] ?? 'unknown'}`} aria-hidden="true" />
                    <div className="agentp__main">
                      <span className="agentp__name">{label(a.householdId)}</span>
                      <span className="agentp__meta">{STATUS_LABEL[a.status] ?? a.status}. {a.note}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {error && <p className="agentp__error" role="alert">{error.includes('perator') ? 'Only a dispatcher can approve. Run `npm run promote` in /monitor and reload.' : error}</p>}
        </div>
      )}
    </aside>
  );
}
