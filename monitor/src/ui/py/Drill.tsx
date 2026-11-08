import type { View } from '../../data/derive';
import { STEP_LABEL } from '../../data/derive';
import type { Household } from '../../data/types';
import { Icon, type IconName } from '../Icon';
import './drill.css';

// Building view: "Who in this building still needs reaching?"
// Left: pick a building. Middle: what state its homes are in, in plain words.
// Right: the households in the chosen state, most urgent first (priority rank,
// then HPI, exactly as the priority table gives them).

export type Cat = 'help' | 'open' | 'power' | 'silent' | 'found' | 'unknown';
type Tone = 'critical' | 'waiting' | 'ok' | 'unknown';

const CATS: { id: Cat; label: string; hint: string; icon: IconName; tone: Tone; test(v: View, h: Household): boolean }[] = [
  { id: 'help', label: 'Needs help', hint: 'Asked for help or was found needing it. Send a responder.', icon: 'alert', tone: 'critical', test: (_v, h) => h.finalState === 'found_needs_help' },
  { id: 'open', label: 'Waiting to be reached', hint: 'Not accounted for yet. Ranked by need.', icon: 'activity', tone: 'waiting', test: (v, h) => h.hasSensor && h.finalState === 'unresolved' && !!v.prio.get(h.id)?.rank },
  { id: 'power', label: 'On a power clock', hint: 'Medical device running on backup power.', icon: 'zap', tone: 'waiting', test: (v, h) => (v.prio.get(h.id)?.tthMin ?? -1) >= 0 && h.finalState !== 'assisted' && h.finalState !== 'found_ok' },
  { id: 'silent', label: 'Silent sensors', hint: 'Sensor stopped reporting. Silence is a signal.', icon: 'wifiOff', tone: 'unknown', test: (v, h) => !!v.node.get(h.id) && !v.node.get(h.id)!.online && h.finalState === 'unresolved' },
  { id: 'found', label: 'Found or assisted', hint: 'Accounted for. Nothing to do.', icon: 'check', tone: 'ok', test: (_v, h) => h.finalState === 'found_ok' || h.finalState === 'assisted' },
  { id: 'unknown', label: 'No sensor', hint: 'Can’t report on its own. Needs a door knock.', icon: 'search', tone: 'unknown', test: (_v, h) => !h.hasSensor },
];

interface Props {
  view: View;
  buildingId: number; // 0 = whole neighborhood
  cat: Cat | null;
  onCat(c: Cat): void;
  onBuilding(id: number): void;
  selected: number | null;
  onSelect(id: number): void;
}

const isOpen = (v: View, h: Household) => !!v.prio.get(h.id)?.rank && h.finalState === 'unresolved';

function segments(v: View, homes: Household[]) {
  const n = Math.max(1, homes.length);
  const c = { critical: 0, waiting: 0, ok: 0, assisted: 0, unknown: 0 };
  for (const h of homes) {
    if (h.finalState === 'found_needs_help') c.critical++;
    else if (h.finalState === 'found_ok') c.ok++;
    else if (h.finalState === 'assisted') c.assisted++;
    else if (!h.hasSensor) c.unknown++;
    else if (isOpen(v, h)) c.waiting++;
    else c.ok++;
  }
  return (Object.keys(c) as (keyof typeof c)[]).filter((k) => c[k]).map((k) => ({ k, w: (c[k] / n) * 100 }));
}

function StatusBar({ view, homes }: { view: View; homes: Household[] }) {
  return (
    <span className="bv-bar" aria-hidden="true">
      {segments(view, homes).map((s) => (
        <i key={s.k} data-s={s.k} style={{ width: `${s.w}%` }} />
      ))}
    </span>
  );
}

export function Drill({ view, buildingId, cat, onCat, onBuilding, selected, onSelect }: Props) {
  const b = buildingId ? view.building.get(buildingId) : undefined;
  const name = b?.name ?? 'All of Cedar Hollow';
  const homes = view.households.filter((h) => !buildingId || h.buildingId === buildingId);
  const cats = CATS.map((c) => ({ ...c, items: homes.filter((h) => c.test(view, h)) }));
  const active = cats.find((c) => c.id === cat) ?? cats.find((c) => c.items.length && c.id !== 'found') ?? cats.find((c) => c.id === 'found')!;
  const byNeed = (a: Household, z: Household) => {
    const pa = view.prio.get(a.id);
    const pz = view.prio.get(z.id);
    if (pa?.rank && pz?.rank) return pa.rank - pz.rank;
    if (pa?.rank) return -1;
    if (pz?.rank) return 1;
    return (pz?.hpi ?? 0) - (pa?.hpi ?? 0);
  };
  const items = [...active.items].sort(byNeed);
  const open = homes.filter((h) => isOpen(view, h));
  const next = [...open].sort(byNeed)[0];
  const buildings = [...view.building.values()].filter((x) => view.households.some((h) => h.buildingId === x.id));

  return (
    <div className="bv">
      <nav className="bv-panel bv-rail" aria-label="Buildings">
        <p className="bv-kicker">Buildings</p>
        {[{ id: 0, name: 'All of Cedar Hollow' }, ...buildings].map((x) => {
          const hs = view.households.filter((h) => !x.id || h.buildingId === x.id);
          const n = hs.filter((h) => isOpen(view, h)).length;
          return (
            <button key={x.id} className="bv-bld" aria-current={buildingId === x.id ? 'true' : undefined} onClick={() => onBuilding(x.id)}>
              <span className="bv-bld-name">{x.name}</span>
              <span className="bv-bld-meta">
                {hs.length} homes · {n ? <b>{n} open</b> : 'all accounted for'}
              </span>
              <StatusBar view={view} homes={hs} />
            </button>
          );
        })}
      </nav>

      <section className="bv-main">
        <header className="bv-panel bv-head">
          <div>
            <p className="bv-kicker">Building view</p>
            <h1 className="bv-title">{name}</h1>
            <p className="bv-meta">
              {b ? `${b.kind === 'multifamily' ? 'Apartments' : b.kind} · ${b.floors} floor${b.floors === 1 ? '' : 's'} · built ${b.builtYear} · ` : `${buildings.length} buildings · `}
              {homes.length} homes
            </p>
          </div>
          <div className="bv-summary">
            <p className="bv-sentence">
              {open.length ? (
                <>
                  <b>{open.length}</b> of {homes.length} homes still need reaching.
                </>
              ) : (
                <>
                  <Icon name="check" size={16} /> Everyone here is accounted for.
                </>
              )}
            </p>
            {next && (
              <button className="bv-primary" onClick={() => onSelect(next.id)}>
                Open next: {next.name} <Icon name="chevronRight" size={14} />
              </button>
            )}
          </div>
        </header>

        <div className="bv-body">
          <div className="bv-cats" role="tablist" aria-label="Household states">
            {cats.map((c) => (
              <button
                key={c.id}
                role="tab"
                aria-selected={c.id === active.id}
                className="bv-cat"
                data-tone={c.tone}
                disabled={!c.items.length && c.id !== active.id}
                onClick={() => onCat(c.id)}
              >
                <span className="bv-cat-top">
                  <Icon name={c.icon} size={16} />
                  <span className="bv-cat-label">{c.label}</span>
                  <b className="bv-cat-n">{c.items.length}</b>
                </span>
                <span className="bv-cat-hint">{c.hint}</span>
              </button>
            ))}
          </div>

          <div className="bv-panel bv-list" role="tabpanel" aria-label={active.label}>
            <div className="bv-list-head">
              <p className="bv-kicker">
                {active.label} · {active.items.length}
              </p>
              <span className="bv-list-sort">Most urgent first</span>
            </div>
            {items.length === 0 ? (
              <p className="bv-empty">
                <Icon name="check" size={16} /> No households in {name} are in this state.
              </p>
            ) : (
              <ol className="bv-rows">
                {items.map((h) => {
                  const p = view.prio.get(h.id);
                  const step = view.esc.get(h.id)?.step ?? 0;
                  const node = view.node.get(h.id);
                  const detail =
                    active.id === 'power' && p && p.tthMin >= 0
                      ? `${Math.round(p.tthMin)} min of backup power left`
                      : active.id === 'silent' && p
                        ? `Silent for ${Math.round(p.minutesSilent)} min`
                        : active.id === 'found'
                          ? h.finalState === 'assisted'
                            ? 'Assisted by responders (simulated)'
                            : 'Found OK'
                          : !h.hasSensor
                            ? 'No sensor in this home'
                            : p?.reason || (node?.online ? 'Sensor online' : 'Sensor offline');
                  const band = !h.hasSensor ? 'unknown' : (p?.band ?? 'low');
                  return (
                    <li key={h.id}>
                      <button className="bv-row" aria-current={selected === h.id ? 'true' : undefined} onClick={() => onSelect(h.id)}>
                        <span className="bv-rank" data-band={band}>
                          {p?.rank ? p.rank : '–'}
                        </span>
                        <span className="bv-row-main">
                          <span className="bv-row-name">
                            {h.name} <small>{view.building.get(h.buildingId)?.name} {h.unit}</small>
                          </span>
                          <span className="bv-row-reason">{detail}</span>
                          {h.hasSensor && h.finalState === 'unresolved' && (
                            <span className="bv-ladder" aria-label={`Ladder step ${step} of 4: ${STEP_LABEL[step]}`}>
                              {[1, 2, 3, 4].map((i) => (
                                <i key={i} className={i <= step ? 'on' : ''} />
                              ))}
                              <em>{step >= 4 ? 'Responder dispatched (simulated)' : STEP_LABEL[step]}</em>
                            </span>
                          )}
                        </span>
                        {p?.scored && (
                          <span className="bv-hpi" data-band={band} title="Headcount Priority Index, from the priority table">
                            {p.hpi.toFixed(0)}
                            <small>HPI</small>
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
