import { spawn, execFile, type ChildProcess } from 'node:child_process';
import type { Plugin } from 'vite';

/**
 * Dev-only: SSH into the Raspberry Pi, run sensor_stream.py there, and serve its live readings
 * at GET /__headcount/pi. In local mode, local-bridge.ts sets `reducerHook.call`, and the Pi's
 * events are forwarded to the household's reducers so its priority card reacts.
 *
 * Env: PI_HOST (default friscogoons@100.76.23.86), HC_HOUSEHOLD (default 1).
 */
export const reducerHook: { call?: (name: string, args: Record<string, unknown>) => Promise<void> } = {};

type Status = 'connecting' | 'warming' | 'live' | 'error';
interface PiEvent {
  t: number;
  kind: string;
  label: string;
  forwarded?: { reducer: string; ok: boolean; error?: string };
}

const LABELS: Record<string, string> = {
  flame: 'Flame detected',
  heat: 'Heat detected',
  shock: 'Shock / shaking detected',
  sound: 'Loud noise detected',
  motion: 'Person detected (motion)',
  online: 'Pi node online',
};

const SSH = ['-o', 'BatchMode=yes', '-o', 'ServerAliveInterval=15', '-o', 'ConnectTimeout=8'];

export function piBridge(): Plugin {
  return {
    name: 'headcount-pi-bridge',
    apply: 'serve',
    configureServer(server) {
      const host = process.env.PI_HOST ?? 'friscogoons@100.76.23.86';
      const household = Number(process.env.HC_HOUSEHOLD ?? '1');

      let status: Status = 'connecting';
      let message: string | undefined;
      let updatedAt = 0;
      let state: Record<string, any> | null = null;
      const events: PiEvent[] = [];
      let child: ChildProcess | undefined;
      let stopped = false;
      let backoff = 1000;
      let retry: NodeJS.Timeout | undefined;
      let lastHeartbeat = 0;
      let shockSince: number | null = null;
      let shockSent = false;

      const forward = async (reducer: string, args: Record<string, unknown>): Promise<PiEvent['forwarded'] | undefined> => {
        if (!reducerHook.call) return undefined;
        try {
          await reducerHook.call(reducer, args);
          return { reducer, ok: true };
        } catch (e) {
          return { reducer, ok: false, error: e instanceof Error ? e.message : String(e) };
        }
      };

      const addEvent = (kind: string, t: number) => {
        const ev: PiEvent = { t, kind, label: LABELS[kind] ?? kind };
        events.unshift(ev);
        if (events.length > 20) events.pop();
        return ev;
      };

      const forwardEvent = async (ev: PiEvent) => {
        const args = { householdId: household };
        const map: Record<string, Record<string, unknown> | undefined> = {
          flame: { ...args, kind: 'flame', value: 1, durationS: 0 },
          heat: { ...args, kind: 'temp', value: 10, durationS: 5 },
          motion: { ...args, kind: 'motion', value: 1, durationS: 0 },
        };
        const a = map[ev.kind];
        if (a) ev.forwarded = await forward('report_event', a);
      };

      const handleState = (s: Record<string, any>) => {
        state = s;
        status = s.warming ? 'warming' : 'live';
        message = undefined;
        backoff = 1000;
        const now = Date.now();
        if (!s.warming && now - lastHeartbeat >= 10_000) {
          lastHeartbeat = now;
          void forward('heartbeat', { householdId: household, onBattery: false });
        }
        // Sustained shaking: shock stays active for >= 2 s continuously.
        const ago = s.lastSeenAgo?.shock;
        if (typeof ago === 'number' && ago < 1) {
          shockSince ??= now;
          const elapsed = (now - shockSince) / 1000;
          if (!shockSent && elapsed >= 2) {
            shockSent = true;
            const ev = addEvent('shock', now);
            ev.label = 'Sustained shaking detected';
            void forward('report_event', { householdId: household, kind: 'shake', value: 0.6, durationS: Math.min(600, Math.round(elapsed * 10) / 10) }).then((f) => {
              ev.forwarded = f;
            });
          }
        } else if (ago == null || ago > 1.5) {
          shockSince = null;
          shockSent = false;
        }
      };

      const handleLine = (line: string) => {
        let o: Record<string, any>;
        try {
          o = JSON.parse(line);
        } catch {
          return;
        }
        updatedAt = Date.now();
        if (o.type === 'state') handleState(o);
        else if (o.type === 'event') {
          const kind = String(o.kind);
          // Shock is reported as an event only once sustained (see handleState); show the raw trigger too.
          const ev = addEvent(kind, typeof o.t === 'number' ? Math.round(o.t * 1000) : Date.now());
          void forwardEvent(ev);
        } else if (o.type === 'error') {
          status = 'error';
          message = String(o.message ?? 'Pi reported an error');
        }
      };

      const scheduleRetry = () => {
        if (stopped) return;
        retry = setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 15_000);
      };

      const connect = () => {
        if (stopped) return;
        if (status !== 'error') status = 'connecting';
        // Free a stale stream first. The [s] trick stops pkill matching its own command line.
        execFile('ssh', [...SSH, host, 'pkill -f "[s]ensor_stream.py"'], { timeout: 15_000 }, () => {
          if (stopped) return;
          const p = spawn('ssh', [...SSH, host, 'python3 -u sensor_stream.py'], { stdio: ['ignore', 'pipe', 'pipe'] });
          child = p;
          let buf = '';
          let errBuf = '';
          p.stdout.on('data', (d: Buffer) => {
            buf += d.toString();
            let i;
            while ((i = buf.indexOf('\n')) >= 0) {
              handleLine(buf.slice(0, i).trim());
              buf = buf.slice(i + 1);
            }
          });
          p.stderr.on('data', (d: Buffer) => {
            errBuf = (errBuf + d.toString()).slice(-400);
          });
          p.on('error', (e) => {
            status = 'error';
            message = `Cannot run ssh: ${e.message}`;
          });
          p.on('close', (code) => {
            if (child === p) child = undefined;
            if (stopped) return;
            if (status !== 'error') {
              status = 'connecting';
              message = errBuf.trim() ? `SSH ended (${code}): ${errBuf.trim().split('\n').pop()}` : `SSH ended (${code}). Reconnecting…`;
            }
            state = status === 'error' ? state : null;
            scheduleRetry();
          });
        });
      };

      const stop = () => {
        stopped = true;
        if (retry) clearTimeout(retry);
        child?.kill();
      };
      server.httpServer?.on('close', stop);
      process.once('exit', stop);
      connect();

      server.middlewares.use('/__headcount/pi', (_req, res) => {
        res.setHeader('content-type', 'application/json');
        res.setHeader('cache-control', 'no-store');
        res.end(JSON.stringify({ household, host, status, message, updatedAt, state, events }));
      });
    },
  };
}
