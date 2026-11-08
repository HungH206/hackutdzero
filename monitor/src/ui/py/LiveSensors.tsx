import { useCallback, useEffect, useRef, useState } from 'react';
import type { PiEvent, PiKind, PiLevel, PiSensors, PiState } from '../../data/pi';
import { Icon, type IconName } from '../Icon';

type Feed = Extract<PiSensors, { available: true }>;

const ROWS: { kind: PiKind; label: string; pin: number; icon: IconName }[] = [
  { kind: 'flame', label: 'Flame', pin: 22, icon: 'flame' },
  { kind: 'heat', label: 'Heat', pin: 27, icon: 'thermo' },
  { kind: 'shock', label: 'Shock', pin: 24, icon: 'quake' },
  { kind: 'sound', label: 'Loud noise', pin: 17, icon: 'radio' },
  { kind: 'motion', label: 'Motion', pin: 23, icon: 'user' },
];

const LEVEL_STATUS: Record<PiLevel, string> = { SAFE: 'ok', WATCH: 'waiting', WARNING: 'waiting', EMERGENCY: 'critical' };
const STALE_MS = 2500;
const FLASH_MS = 1100;

function secs(s: number | null | undefined): string {
  if (s == null) return 'never';
  if (s < 1) return 'just now';
  if (s < 60) return `${Math.round(s)}s ago`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s ago`;
}

const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour12: false });

type Mic = { status: 'off' | 'on' | 'denied'; level: number; lastLoud: number | null; count: number; start(): void };

/** Laptop microphone as the loud-noise sensor (browser only, nothing is recorded or sent). */
function useMic(): Mic {
  const [m, setM] = useState({ status: 'off' as Mic['status'], level: 0, lastLoud: null as number | null, count: 0 });
  const started = useRef(false);
  const start = useCallback(async () => {
    if (started.current) return;
    started.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.fftSize);
      let level = 0, loud = false, count = 0, lastLoud: number | null = null;
      window.setInterval(() => {
        an.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += ((v - 128) / 128) ** 2;
        const rms = Math.min(1, Math.sqrt(sum / buf.length) * 5);
        level = Math.max(rms, level * 0.85);
        const now = level > 0.35;
        if (now && !loud) count++;
        if (now) lastLoud = Date.now();
        loud = now;
        setM({ status: 'on', level, lastLoud, count });
      }, 100);
    } catch {
      started.current = false;
      setM((x) => ({ ...x, status: 'denied' }));
    }
  }, []);
  useEffect(() => void start(), [start]);
  return { ...m, start };
}

export function LiveSensors({ pi }: { pi: Feed }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  const age = pi.updatedAt ? now - pi.updatedAt : Infinity;
  const stale = pi.status === 'live' && age > STALE_MS;
  const mode: 'live' | 'warming' | 'stale' | 'error' | 'connecting' =
    pi.status === 'error' ? 'error' : stale ? 'stale' : pi.status;
  const s = pi.state;
  const mic = useMic();

  // Row flash when a new trigger event arrives.
  const [flash, setFlash] = useState<Record<string, number>>({});
  const seen = useRef<number | null>(null);
  const newest = pi.events[0];
  useEffect(() => {
    if (!newest) return;
    if (seen.current === null) {
      seen.current = newest.t; // do not flash for history on first load
      return;
    }
    if (newest.t > seen.current) {
      seen.current = newest.t;
      if (newest.kind !== 'online') setFlash((f) => ({ ...f, [newest.kind]: Date.now() }));
    }
  }, [newest]);

  const headline =
    mode === 'live'
      ? `updated ${age < 1000 ? `${Math.max(0, age / 1000).toFixed(1)}s` : `${(age / 1000).toFixed(1)}s`} ago`
      : mode === 'stale'
        ? `no data for ${(age / 1000).toFixed(0)}s`
        : mode === 'warming'
          ? s?.warmupLeft != null
            ? `calibrating, ${Math.ceil(s.warmupLeft)}s left`
            : 'calibrating sensors'
          : mode === 'error'
            ? 'feed error'
            : 'connecting over SSH';

  return (
    <section className={`py-live is-${mode}`} aria-label="Live sensor feed from the Raspberry Pi" data-ui="panel">
      <header className="py-live-h">
        <span className="py-live-kicker">
          <i className="py-live-dot" aria-hidden="true" />
          Live from Pi
        </span>
        <span className="py-live-host">{pi.host}</span>
      </header>
      <div className="py-live-sub">
        <span>{headline}</span>
        {s && !s.warming && mode !== 'error' && (
          <span className="py-live-node" data-status={LEVEL_STATUS[s.level]}>
            <b>{s.level}</b>
            <span>node risk {s.risk.toFixed(0)}</span>
          </span>
        )}
      </div>

      {mode === 'error' && (
        <p className="py-live-err" role="alert">
          {pi.message || 'The Pi feed reported an error.'}
        </p>
      )}

      {s && !s.warming && mode !== 'error' && <ShockMeter s={s} tick={pi.receivedAt} dim={mode === 'stale'} />}

      {s && mode !== 'error' && <Rows s={s} flash={flash} now={now} dim={mode === 'stale'} mic={mic} />}

      {s && !s.warming && mode !== 'error' && (
        <div className="py-live-person" data-on={s.occupied ? 'yes' : 'no'}>
          <Icon name="user" size={16} />
          <span>
            <b>{s.occupied ? 'Person inside' : 'No one detected'}</b>
            <small>
              {s.lastMotionAgo == null ? 'no motion yet' : `last motion ${secs(s.lastMotionAgo)}`} · {s.motionCount} motion event
              {s.motionCount === 1 ? '' : 's'}
            </small>
          </span>
        </div>
      )}

      <div className="py-live-feed">
        <span className="py-live-feed-h">Node events</span>
        {pi.events.length === 0 ? (
          <p className="py-live-empty">Nothing yet. Clap, wave, or hold a flame near the sensors.</p>
        ) : (
          <ul>
            {pi.events.slice(0, 6).map((e) => (
              <Event key={`${e.t}-${e.kind}`} e={e} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

const SHOCK_SAMPLES = 60; // 15 s at the 250 ms poll

/** Live vibration trace: bars are shock-pin edges per sample, so every tap is visible. */
function ShockMeter({ s, tick, dim }: { s: PiState; tick: number; dim: boolean }) {
  const hist = useRef<number[]>(Array(SHOCK_SAMPLES).fill(0));
  const prev = useRef<number | null>(null);
  const [, redraw] = useState(0);
  useEffect(() => {
    const d = prev.current == null ? 0 : Math.max(0, s.edges.shock - prev.current);
    prev.current = s.edges.shock;
    hist.current = [...hist.current.slice(1), d];
    redraw((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const ago = s.lastSeenAgo.shock;
  const active = ago != null && ago < 3;
  const recent = hist.current.slice(-40).reduce((a, b) => a + b, 0);
  const peak = Math.max(...hist.current.slice(-40));
  const strength = peak >= 10 ? 'Strong' : peak >= 3 ? 'Moderate' : 'Light';
  return (
    <div className={`py-shock${active ? ' active' : ''}${dim ? ' dim' : ''}`} data-ui="shock-meter" role="status" aria-label="Shock and vibration">
      <div className="py-shock-h">
        <span className="py-shock-t">
          <Icon name="quake" size={18} />
          Shock / vibration
        </span>
        <span className="py-shock-badge">{active ? `${strength} shaking` : 'Steady'}</span>
      </div>
      <svg className="py-shock-trace" viewBox="0 0 240 44" preserveAspectRatio="none" aria-hidden="true">
        <line x1="0" y1="43.5" x2="240" y2="43.5" className="base" />
        {hist.current.map((v, i) => {
          const h = v <= 0 ? 0 : 5 + Math.min(1, v / 8) * 37;
          return <rect key={i} x={i * 4 + 0.5} width={3} y={44 - h} height={h} rx={1} className={v > 0 ? 'on' : ''} />;
        })}
      </svg>
      <div className="py-shock-f">
        <span>
          <b>{recent}</b> taps in 10s
        </span>
        <span>
          <b>{s.edges.shock}</b> total
        </span>
        <span>{ago == null ? 'never triggered' : `last ${secs(ago)}`}</span>
      </div>
    </div>
  );
}

function Rows({ s, flash, now, dim, mic }: { s: PiState; flash: Record<string, number>; now: number; dim: boolean; mic: Mic }) {
  return (
    <div className={`py-live-rows${dim ? ' dim' : ''}`} role="table" aria-label="Sensors">
      {ROWS.map((r) => {
        const isMotion = r.kind === 'motion';
        const useMicRow = r.kind === 'sound' && mic.status === 'on';
        const pin = s.pins[r.kind];
        const tripped = useMicRow ? mic.level > 0.35 : isMotion ? pin === 1 : pin !== s.idle[r.kind as Exclude<PiKind, 'motion'>];
        const act = useMicRow ? mic.level : isMotion ? (s.occupied ? 1 : 0) : s.activity[r.kind as Exclude<PiKind, 'motion'>];
        const ago = useMicRow ? (mic.lastLoud == null ? null : (now - mic.lastLoud) / 1000) : isMotion ? s.lastMotionAgo : s.lastSeenAgo[r.kind as Exclude<PiKind, 'motion'>];
        const edges = useMicRow ? mic.count : isMotion ? s.motionCount : s.edges[r.kind as Exclude<PiKind, 'motion'>];
        const flashing = flash[r.kind] != null && now - flash[r.kind]! < FLASH_MS;
        return (
          <div key={r.kind} className={`py-live-row kind-${r.kind}${tripped ? ' tripped' : ''}${flashing ? ' flash' : ''}`} role="row">
            <span className="py-live-ico">
              <Icon name={r.icon} size={18} />
            </span>
            <span className="py-live-name">
              {r.label}
              <small>{useMicRow ? 'Laptop mic' : `GPIO ${r.pin}`}</small>
            </span>
            <span className="py-live-bar" aria-hidden="true">
              <i style={{ width: `${Math.round(Math.min(1, Math.max(0, act)) * 100)}%` }} />
            </span>
            <span className="py-live-pin" title={`pin reads ${pin}`}>
              <b>{useMicRow ? Math.round(mic.level * 100) : pin}</b>
              <small>{tripped ? 'tripped' : 'idle'}</small>
            </span>
            <span className="py-live-meta">
              {secs(ago)}
              <small>
                {edges} {useMicRow ? 'spikes' : isMotion ? 'events' : 'edges'}
              </small>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Event({ e }: { e: PiEvent }) {
  const f = e.forwarded;
  return (
    <li>
      <time>{clock(e.t)}</time>
      <span className="py-live-ev">{e.label}</span>
      {f && f.ok && (
        <span className="py-live-sent" title={`reducer: ${f.reducer}`}>
          <Icon name="check" size={12} /> sent to priority engine
        </span>
      )}
      {f && !f.ok && (
        <span className="py-live-fail" title={f.reducer}>
          <Icon name="warn" size={12} /> {f.error || 'not sent'}
        </span>
      )}
    </li>
  );
}
