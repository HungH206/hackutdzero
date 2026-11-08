import { useEffect, useState } from 'react';

// Live feed from the Raspberry Pi node, served by the dev-only Pi bridge
// (monitor/pi-bridge.ts) at /__headcount/pi. Read-only: the UI never scores anything.

export type PiKind = 'flame' | 'heat' | 'shock' | 'sound' | 'motion';
export type PiLevel = 'SAFE' | 'WATCH' | 'WARNING' | 'EMERGENCY';

type PerSensor<T> = Record<'flame' | 'heat' | 'shock' | 'sound', T>;

export interface PiState {
  type: 'state';
  warming: boolean;
  warmupLeft?: number;
  pins: PerSensor<0 | 1> & { motion: 0 | 1 };
  idle: PerSensor<0 | 1>;
  activity: PerSensor<number>;
  lastSeenAgo: PerSensor<number | null>;
  lastMotionAgo: number | null;
  edges: PerSensor<number>;
  motionCount: number;
  occupied: boolean;
  risk: number;
  level: PiLevel;
}

export interface PiEvent {
  t: number;
  kind: PiKind | 'online';
  label: string;
  forwarded?: { reducer: string; ok: boolean; error?: string };
}

export interface PiFeed {
  household: number;
  host: string;
  status: 'connecting' | 'warming' | 'live' | 'error';
  message?: string;
  updatedAt: number;
  state: PiState | null;
  events: PiEvent[];
}

export type PiSensors = ({ available: true; receivedAt: number } & PiFeed) | { available: false };

const POLL_MS = 250;

export function usePiSensors(): PiSensors {
  const [feed, setFeed] = useState<PiSensors>({ available: false });

  useEffect(() => {
    let alive = true;
    let timer = 0;
    const tick = async () => {
      try {
        const r = await fetch('/__headcount/pi', { cache: 'no-store' });
        if (!r.ok) throw new Error(String(r.status));
        const data = (await r.json()) as PiFeed;
        if (alive) setFeed({ available: true, receivedAt: Date.now(), ...data });
      } catch {
        if (alive) setFeed((f) => (f.available ? f : { available: false }));
      }
      if (alive) timer = window.setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, []);

  return feed;
}
