import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { emptySnapshot, normalize, type Actions, type ConnectionInfo, type Snapshot } from './types';

declare const __HEADCOUNT_SOURCE__: 'spacetimedb' | 'local';

interface HeadcountValue {
  snapshot: Snapshot;
  actions: Actions;
  connection: ConnectionInfo;
}

const Ctx = createContext<HeadcountValue | null>(null);

export function useHeadcount(): HeadcountValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useHeadcount must be used inside <HeadcountProvider>');
  return v;
}

type Call = (reducer: string, args: Record<string, unknown>) => Promise<void>;

function makeActions(call: Call): Actions {
  return {
    overridePriority: (householdId, delta, reason) => call('override_priority', { householdId, delta, reason }),
    setFinalState: (householdId, state, note) => call('set_final_state', { householdId, state, note }),
    submitCheckin: (householdId, answer, source) => call('submit_checkin', { householdId, answer, source }),
    simQuake: (x, y, magnitude) => call('sim_quake', { x, y, magnitude }),
    simFire: (householdId) => call('sim_fire', { householdId }),
    simPowerLoss: (x, y, radius) => call('sim_power_loss', { x, y, radius }),
    simCommsOutage: (x, y, radius) => call('sim_comms_outage', { x, y, radius }),
    simFastForward: (minutes) => call('sim_fast_forward', { minutes }),
    simReset: () => call('sim_reset', {}),
  };
}

export function HeadcountProvider({ children }: { children: ReactNode }) {
  return __HEADCOUNT_SOURCE__ === 'local' ? <LocalSource>{children}</LocalSource> : <SpacetimeSource>{children}</SpacetimeSource>;
}

// ---------- Local fallback: module running in the Vite dev server ----------

function LocalSource({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [connection, setConnection] = useState<ConnectionInfo>({ source: 'local', status: 'connecting', detail: 'Starting local module…' });
  const refresh = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    let alive = true;
    refresh.current = async () => {
      try {
        const r = await fetch('/__headcount/state');
        if (!r.ok) throw new Error(await r.text());
        const s = (await r.json()) as Snapshot;
        if (!alive) return;
        setSnapshot(s);
        setConnection({ source: 'local', status: 'live', detail: 'Local fallback: module running in-process (no SpacetimeDB server)' });
      } catch (e) {
        if (alive) setConnection({ source: 'local', status: 'error', detail: e instanceof Error ? e.message.slice(0, 200) : String(e) });
      }
    };
    void refresh.current();
    const id = setInterval(() => void refresh.current(), 800);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const actions = useMemo(
    () =>
      makeActions(async (reducer, args) => {
        const r = await fetch('/__headcount/call', { method: 'POST', body: JSON.stringify({ reducer, args }) });
        if (!r.ok) throw new Error(((await r.json()) as { error: string }).error);
        await refresh.current();
      }),
    [],
  );

  return <Ctx.Provider value={{ snapshot, actions, connection }}>{children}</Ctx.Provider>;
}

// ---------- SpacetimeDB: live subscription to the published module ----------

// Bindings come from `spacetime generate` (see README). They load lazily so the
// app still builds before they have been generated.
const bindingModules = import.meta.glob('../module_bindings/index.ts');

const TABLE_KEYS: [keyof Snapshot, string][] = [
  ['buildings', 'building'],
  ['households', 'household'],
  ['nodes', 'node'],
  ['disasters', 'disaster'],
  ['checkins', 'checkin'],
  ['escalations', 'escalation'],
  ['priorities', 'priority'],
  ['overrides', 'overrideLog'],
  ['timeline', 'timeline'],
];

const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

function SpacetimeSource({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [connection, setConnection] = useState<ConnectionInfo>({ source: 'spacetimedb', status: 'connecting', detail: 'Connecting to SpacetimeDB…' });
  const connRef = useRef<any>(null);

  useEffect(() => {
    const load = bindingModules['../module_bindings/index.ts'];
    if (!load) {
      setConnection({
        source: 'spacetimedb',
        status: 'error',
        detail: 'No module bindings yet. Run `npm run generate` in /monitor, or start with `npm run dev:local`.',
      });
      return;
    }
    const uri = import.meta.env.VITE_SPACETIME_URI ?? 'ws://localhost:3000';
    const db = import.meta.env.VITE_SPACETIME_DB ?? 'headcount';
    let conn: any;
    let frame = 0;

    const read = (c: any) => {
      const s: Snapshot = { ...emptySnapshot };
      for (const [key, table] of TABLE_KEYS) {
        const handle = c.db[table] ?? c.db[camel(table)];
        (s as any)[key] = handle ? [...handle.iter()].map((r: unknown) => normalize(r)) : [];
      }
      const clock = c.db.clock ? [...c.db.clock.iter()][0] : null;
      s.clockOffsetMicros = clock ? Number(clock.offsetMicros) : 0;
      return s;
    };
    // Coalesce bursts of row callbacks into one render per frame.
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (conn) setSnapshot(read(conn));
      });
    };

    void load().then((m: any) => {
      conn = m.DbConnection.builder()
        .withUri(uri)
        .withDatabaseName(db)
        .withAutomaticReconnect()
        .onConnect((c: any) => {
          setConnection({ source: 'spacetimedb', status: 'live', detail: `Live: SpacetimeDB ${db} @ ${uri}` });
          for (const [, table] of [...TABLE_KEYS, ['clock', 'clock'] as const]) {
            const handle = c.db[table];
            if (!handle) continue;
            handle.onInsert?.(schedule);
            handle.onDelete?.(schedule);
            handle.onUpdate?.(schedule);
          }
          c.subscriptionBuilder().onApplied(schedule).subscribeToAllTables();
        })
        .onDisconnect(() => setConnection({ source: 'spacetimedb', status: 'error', detail: 'Disconnected from SpacetimeDB. Retrying…' }))
        .onConnectError((_c: unknown, e: unknown) =>
          setConnection({ source: 'spacetimedb', status: 'error', detail: `Cannot reach SpacetimeDB at ${uri}: ${String(e)}` }),
        )
        .build();
      connRef.current = conn;
    });
    return () => {
      cancelAnimationFrame(frame);
      conn?.disconnect();
    };
  }, []);

  const actions = useMemo(
    () =>
      makeActions(async (reducer, args) => {
        const c = connRef.current;
        if (!c) throw new Error('Not connected to SpacetimeDB');
        const fn = c.reducers[camel(reducer)] ?? c.reducers[reducer];
        if (!fn) throw new Error(`Reducer ${reducer} not found in bindings`);
        await fn(args);
      }),
    [],
  );

  return <Ctx.Provider value={{ snapshot, actions, connection }}>{children}</Ctx.Provider>;
}
