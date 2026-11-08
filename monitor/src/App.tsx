import { useCallback, useEffect, useRef, useState } from 'react';
import { useScenarioNow, useView } from './data/derive';
import { useHeadcount } from './data/HeadcountProvider';
import { Analytics } from './ui/Analytics';
import { CommandDock, type DockHandle } from './ui/CommandDock';
import { DemoPanel } from './ui/DemoPanel';
import { DetailCard } from './ui/DetailCard';
import { EventLog } from './ui/EventLog';
import { Icon } from './ui/Icon';
import { Legend } from './ui/Legend';
import { MapCanvas, type Layer } from './ui/MapCanvas';
import { QueuePanel } from './ui/QueuePanel';
import { Rail, type ViewId } from './ui/Rail';
import { Toasts, useAlerts } from './ui/Toasts';
import { TopBar } from './ui/TopBar';

export function App() {
  const { snapshot, actions, connection } = useHeadcount();
  const view = useView(snapshot);
  const now = useScenarioNow(snapshot.clockOffsetMicros);
  // Deep links: ?view=analytics|log and ?h=<household id>.
  const params = new URLSearchParams(window.location.search);
  const [screen, setScreen] = useState<ViewId>(() => (['live', 'analytics', 'log'].includes(params.get('view') ?? '') ? (params.get('view') as ViewId) : 'live'));
  const [hovered, setHovered] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(() => (params.get('h') ? Number(params.get('h')) : null));
  const [layers, setLayers] = useState<Set<Layer>>(() => new Set<Layer>(['heat', 'hazard', 'responders', 'outage', 'power']));
  const [error, setError] = useState<string | null>(null);
  const dock = useRef<DockHandle>(null);
  const alerts = useAlerts(snapshot.timeline);

  // A selected household that no longer exists (after reset) closes the card.
  const selectedId = selected !== null && view.hh.has(selected) ? selected : null;

  const select = useCallback((id: number | null) => {
    setSelected(id);
    if (id !== null) setScreen('live');
  }, []);

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(id);
  }, [error]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setScreen('live');
        requestAnimationFrame(() => dock.current?.focus());
      } else if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleLayer = (l: Layer) =>
    setLayers((s) => {
      const n = new Set(s);
      if (n.has(l)) n.delete(l);
      else n.add(l);
      return n;
    });

  return (
    <div className={`app screen-${screen}${selectedId !== null ? ' has-detail' : ''}${view.disasterActive ? ' incident' : ''}`}>
      <Rail
        active={screen}
        onChange={(v) => {
          setScreen(v);
          if (v === 'log') alerts.clearUnread();
        }}
        logCount={alerts.unread}
      />
      <div className="stage">
        <MapCanvas
          view={view}
          disasters={snapshot.disasters}
          now={now}
          layers={layers}
          hovered={hovered}
          selected={selectedId}
          onHover={setHovered}
          onSelect={select}
          onToggleLayer={toggleLayer}
        />
        <TopBar
          view={view}
          now={now}
          offsetMicros={snapshot.clockOffsetMicros}
          connection={connection}
          unread={alerts.unread}
          onBell={() => {
            alerts.clearUnread();
            setScreen('log');
          }}
          onSearch={() => {
            setScreen('live');
            requestAnimationFrame(() => dock.current?.focus());
          }}
          demo={<DemoPanel view={view} actions={actions} onError={setError} />}
        />
        {screen === 'live' && (
          <>
            <QueuePanel view={view} now={now} hovered={hovered} selected={selectedId} onHover={setHovered} onSelect={select} />
            {selectedId !== null && (
              <DetailCard
                key={selectedId}
                id={selectedId}
                view={view}
                now={now}
                overrides={snapshot.overrides}
                timeline={snapshot.timeline}
                actions={actions}
                onClose={() => setSelected(null)}
                onError={setError}
              />
            )}
            <Legend />
            <CommandDock ref={dock} view={view} snapshot={snapshot} actions={actions} onSelect={select} onError={setError} />
          </>
        )}
        {screen !== 'live' && (
          <div className="page">
            {screen === 'analytics' ? (
              <Analytics view={view} snapshot={snapshot} now={now} onSelect={select} />
            ) : (
              <EventLog rows={snapshot.timeline} view={view} onSelect={select} />
            )}
          </div>
        )}
        <Toasts
          toasts={alerts.toasts}
          onDismiss={alerts.dismiss}
          onOpen={(t) => {
            alerts.dismiss(t.id);
            if (t.householdId && view.hh.has(t.householdId)) select(t.householdId);
          }}
        />
        {error && (
          <div className="err-toast glass" role="alert">
            <Icon name="alert" size={16} /> {error}
          </div>
        )}
      </div>
    </div>
  );
}
