import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { Analysis } from './ui/py/Analysis';
import { concernsOf } from './ui/py/concerns';
import { PyDetail } from './ui/py/Detail';
import { Drill, type Cat } from './ui/py/Drill';
import { Graph, type GraphFilter } from './ui/py/Graph';
import { Header, type Screen } from './ui/py/Header';
import { PyLegend } from './ui/py/Legend';
import { TimeRail } from './ui/py/TimeRail';
import { Toasts, useAlerts } from './ui/Toasts';
import { portView } from './dashboards';
import { Houses } from './ui/houses/Houses';
import { Overview } from './ui/overview/Overview';

const SCREENS: Screen[] = ['overview', 'graph', 'tree', 'houses', 'map', 'analytics', 'log'];

export function App() {
  const { snapshot, actions, connection } = useHeadcount();
  const view = useView(snapshot);
  const now = useScenarioNow(snapshot.clockOffsetMicros);

  // Deep links: ?view=graph|tree|map|analytics|log, ?h=<household id>, ?b=<building id>.
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const [screen, setScreen] = useState<Screen>(() => {
    const v = params.get('view') ?? portView();
    return SCREENS.includes(v as Screen) ? (v as Screen) : 'graph';
  });
  const [selected, setSelected] = useState<number | null>(() => (params.get('h') ? Number(params.get('h')) : null));
  const [buildingId, setBuildingId] = useState(() => Number(params.get('b') ?? 0));
  const [cat, setCat] = useState<Cat | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [filter, setFilter] = useState<GraphFilter>('all');
  const [analysisOpen, setAnalysisOpen] = useState(true);
  const [layers, setLayers] = useState<Set<Layer>>(() => new Set<Layer>(['heat', 'hazard', 'responders', 'outage', 'power']));
  const [error, setError] = useState<string | null>(null);
  const dock = useRef<DockHandle>(null);
  const alerts = useAlerts(snapshot.timeline);

  const selectedId = selected !== null && view.hh.has(selected) ? selected : null;
  const concerns = concernsOf(view);

  const select = useCallback((id: number | null) => {
    setSelected(id);
    setScreen((s) => (id !== null && (s === 'analytics' || s === 'log' || s === 'overview') ? 'graph' : s));
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
        setScreen((s) => (s === 'analytics' || s === 'log' || s === 'overview' || s === 'houses' ? 'graph' : s));
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

  const graphish = screen === 'graph' || screen === 'tree';
  const dockEl = (
    <CommandDock
      ref={dock}
      view={view}
      snapshot={snapshot}
      actions={actions}
      onSelect={select}
      onError={setError}
      placeholder="Ask about a household, or type quake, fire, ff 10, reset…"
      footer={
        graphish ? (
          <div className="py-dock-foot">
            <span className="py-chip">
              <Icon name="user" size={14} /> Dispatcher
            </span>
            <span className="py-chip">
              <Icon name="clock" size={14} /> {view.queue.length} open
            </span>
            <button className={`py-chip action${analysisOpen ? ' on' : ''}`} onClick={() => setAnalysisOpen((o) => !o)} aria-pressed={analysisOpen}>
              <Icon name="activity" size={14} /> HPI Analysis
            </button>
          </div>
        ) : null
      }
    />
  );

  return (
    <div className={`app py-app screen-${screen === 'map' ? 'live' : screen}${selectedId !== null ? ' has-detail' : ''}${view.disasterActive ? ' incident' : ''}`}>
      <div className="py-bg" aria-hidden="true" />

      {screen === 'graph' && (
        <>
          <Graph view={view} zoom={zoom} filter={filter} selected={selectedId} onSelect={select} onOpenBuilding={(id) => {
            setBuildingId(id);
            setCat(null);
            setScreen('tree');
          }} />
          <TimeRail snapshot={snapshot} now={now} />
          <PyLegend view={view} updates={snapshot.timeline.length} />
        </>
      )}
      {screen === 'tree' && (
        <Drill
          view={view}
          buildingId={buildingId}
          cat={cat}
          onCat={setCat}
          onBuilding={(id) => {
            setBuildingId(id);
            setCat(null);
          }}
          selected={selectedId}
          onSelect={select}
        />
      )}
      {screen === 'graph' && (
        <div className={`py-bottom${selectedId !== null ? ' shifted' : ''}`}>
          {analysisOpen && view.disasterActive && concerns.length > 0 && <Analysis concerns={concerns} onSelect={select} onClose={() => setAnalysisOpen(false)} />}
          {dockEl}
        </div>
      )}
      {graphish && selectedId !== null && (
        <PyDetail
          key={selectedId}
          id={selectedId}
          view={view}
          now={now}
          actions={actions}
          onClose={() => setSelected(null)}
          onError={setError}
          onFullRecord={() => setScreen('map')}
        />
      )}

      {screen === 'houses' && (
        <Houses
          view={view}
          now={now}
          selected={selectedId}
          onSelect={setSelected}
          onOpen={(id) => {
            setSelected(id);
            setScreen('map');
          }}
        />
      )}

      {screen === 'map' && (
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
          {dockEl}
        </div>
      )}

      {(screen === 'analytics' || screen === 'log') && (
        <div className="page">
          {screen === 'analytics' ? <Analytics view={view} snapshot={snapshot} now={now} onSelect={select} /> : <EventLog rows={snapshot.timeline} view={view} onSelect={select} />}
        </div>
      )}

      {screen === 'overview' && (
        <Overview
          view={view}
          snapshot={snapshot}
          now={now}
          actions={actions}
          unread={alerts.unread}
          onNav={(s) => {
            setScreen(s);
            if (s === 'log') alerts.clearUnread();
          }}
          onSelectGlobal={(id) => {
            setSelected(id);
            setScreen('map');
          }}
          onSearch={() => {
            setScreen('map');
            requestAnimationFrame(() => dock.current?.focus());
          }}
          onError={setError}
        />
      )}

      {screen !== 'overview' && <Header
        screen={screen}
        onScreen={(s) => {
          setScreen(s);
          if (s === 'log') alerts.clearUnread();
        }}
        zoom={zoom}
        onZoom={setZoom}
        filter={filter}
        onFilter={setFilter}
        openCount={view.queue.length}
        unread={alerts.unread}
        now={now}
        offsetMicros={snapshot.clockOffsetMicros}
        connection={connection}
        onSearch={() => {
          if (screen !== 'graph' && screen !== 'map') setScreen('graph');
          requestAnimationFrame(() => dock.current?.focus());
        }}
        onBell={() => {
          alerts.clearUnread();
          setScreen('log');
        }}
        demo={<DemoPanel view={view} actions={actions} onError={setError} />}
      />}

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
  );
}
