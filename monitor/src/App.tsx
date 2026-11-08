import { useEffect, useState } from 'react';
import { Coverage } from './components/Coverage';
import { DemoControls } from './components/DemoControls';
import { Header } from './components/Header';
import { HouseholdCard } from './components/HouseholdCard';
import { LAYERS, PriorityMap, type Layer } from './components/PriorityMap';
import { Queue } from './components/Queue';
import { Timeline } from './components/Timeline';
import { useScenarioNow, useView } from './data/derive';
import { useHeadcount } from './data/HeadcountProvider';

export function App() {
  const { snapshot, actions, connection } = useHeadcount();
  const view = useView(snapshot);
  const now = useScenarioNow(snapshot.clockOffsetMicros);
  const [hovered, setHovered] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [layers, setLayers] = useState<Set<Layer>>(() => new Set<Layer>(['hazard', 'outage', 'power']));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(id);
  }, [error]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelected(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggle = (l: Layer) =>
    setLayers((s) => {
      const n = new Set(s);
      if (n.has(l)) n.delete(l);
      else n.add(l);
      return n;
    });

  return (
    <div className="app">
      <Header
        view={view}
        now={now}
        offsetMicros={snapshot.clockOffsetMicros}
        connection={connection}
        demo={<DemoControls view={view} actions={actions} onError={setError} />}
      />
      <main className="main">
        <section className="panel map-panel" aria-label="Live priority map">
          <div className="panel-head">
            <h2>Live priority map · Cedar Hollow (fictional)</h2>
            <div className="layers">
              {LAYERS.map((l) => (
                <button key={l.id} className={`chip-toggle${layers.has(l.id) ? ' on' : ''}`} onClick={() => toggle(l.id)} aria-pressed={layers.has(l.id)}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>
          <div className="map-wrap">
            <PriorityMap
              view={view}
              disasters={snapshot.disasters}
              layers={layers}
              hovered={hovered}
              selected={selected}
              onHover={setHovered}
              onSelect={setSelected}
            />
          </div>
          <div className="map-legend">
              <span><i style={{ background: 'var(--critical)' }} />75-100 critical</span>
              <span><i style={{ background: 'var(--high)' }} />50-74 high</span>
              <span><i style={{ background: 'var(--guarded)' }} />25-49 guarded</span>
              <span><i style={{ background: 'var(--low)' }} />0-24 low</span>
              <span>✓ found OK</span>
              <span>A assisted</span>
              <span>? unknown</span>
              <span>1-10 rank · dashed = node offline</span>
          </div>
        </section>

        <section className="panel side" aria-label="Priority queue">
          <Queue view={view} now={now} hovered={hovered} selected={selected} onHover={setHovered} onSelect={setSelected} />
          {selected !== null && (
            <HouseholdCard
              key={selected}
              id={selected}
              view={view}
              now={now}
              overrides={snapshot.overrides}
              actions={actions}
              onClose={() => setSelected(null)}
              onError={setError}
            />
          )}
        </section>

        <div className="bottom">
          <section className="panel" aria-label="Event timeline">
            <Timeline rows={snapshot.timeline} onSelect={setSelected} />
          </section>
          <section className="panel" aria-label="Coverage and alerts">
            <Coverage view={view} onSelect={setSelected} />
          </section>
        </div>
      </main>
      {error && <div className="toast" role="alert">{error}</div>}
    </div>
  );
}
