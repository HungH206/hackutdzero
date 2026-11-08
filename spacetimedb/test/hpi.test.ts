import { describe, expect, it } from 'vitest';
import { aging, band, clockK, exposure, ladderWaitMinutes, score, silence, vulnerability } from '../src/hpi';

// The three worked examples in README.md. E is given there directly.
describe('README worked examples', () => {
  it('Mrs. Alvarez scores 95.0', () => {
    const V = vulnerability({ poweredMedical: true, age: 82, mobilityLimited: true, livesAlone: true, languageBarrier: false, infant: false });
    const S = silence({ minutesSilent: 14, abrupt: false, recentMotion: false, commsOutage: false });
    const K = clockK({ poweredMedical: true, minutesSincePowerLoss: 60, backupRuntimeMin: 180, flame: false });
    expect(V).toBe(1);
    expect(S).toBeCloseTo(0.7);
    expect(K).toBeCloseTo(1.25);
    const r = score({ E: 0.79, S, C: 0.7, V, K, A: 3, override: 0, flame: false });
    expect(r.L).toBeCloseTo(0.736);
    expect(r.hpi).toBe(95.0);
  });

  it('healthy 30-year-old near the epicenter scores 38.8', () => {
    const V = vulnerability({ poweredMedical: false, age: 30, mobilityLimited: false, livesAlone: false, languageBarrier: false, infant: false });
    const S = silence({ minutesSilent: 14, abrupt: false, recentMotion: false, commsOutage: false });
    const K = clockK({ poweredMedical: false, minutesSincePowerLoss: null, backupRuntimeMin: 0, flame: false });
    const r = score({ E: 0.74, S, C: 0.7, V, K, A: 3, override: 0, flame: false });
    expect(r.L).toBeCloseTo(0.716);
    expect(r.M).toBe(0.5);
    expect(r.hpi).toBe(38.8);
  });

  it('fire in own unit scores 94.5 via the fire floor', () => {
    const V = vulnerability({ poweredMedical: false, age: 75, mobilityLimited: false, livesAlone: true, languageBarrier: false, infant: false });
    const S = silence({ minutesSilent: 3, abrupt: false, recentMotion: false, commsOutage: false });
    const K = clockK({ poweredMedical: false, minutesSincePowerLoss: null, backupRuntimeMin: 0, flame: true });
    expect(V).toBeCloseTo(0.4);
    expect(S).toBeCloseTo(0.15);
    expect(K).toBe(1.5);
    const r = score({ E: 0.71, S, C: 0.35, V, K, A: 0, override: 0, flame: true });
    expect(r.L).toBe(0.9);
    expect(r.hpi).toBe(94.5);
  });
});

describe('formula pieces', () => {
  it('exposure combines quake and fire', () => {
    expect(exposure({ shaking: 0, buildingRisk: 0, flame: false, tempRiseC: 0, neighborFire: false })).toBe(0);
    expect(exposure({ shaking: 1, buildingRisk: 1, flame: true, tempRiseC: 30, neighborFire: true })).toBe(1);
  });
  it('silence discounts motion and comms outage, and boosts abrupt loss', () => {
    expect(silence({ minutesSilent: 20, abrupt: false, recentMotion: true, commsOutage: false })).toBe(0.5);
    expect(silence({ minutesSilent: 20, abrupt: false, recentMotion: false, commsOutage: true })).toBe(0.5);
    expect(silence({ minutesSilent: 0, abrupt: true, recentMotion: false, commsOutage: false })).toBeCloseTo(0.2);
  });
  it('override is clamped and score is clamped to [0,100]', () => {
    expect(score({ E: 1, S: 1, C: 1, V: 1, K: 1.5, A: 10, override: 99, flame: true }).hpi).toBe(100);
    expect(score({ E: 0, S: 0, C: 0, V: 0, K: 1, A: 0, override: -99, flame: false }).hpi).toBe(0);
  });
  it('aging caps at 10, bands and ladder waits', () => {
    expect(aging(35)).toBe(3);
    expect(aging(500)).toBe(10);
    expect([band(10), band(30), band(60), band(80)]).toEqual(['low', 'guarded', 'high', 'critical']);
    expect(ladderWaitMinutes(0)).toBe(6);
    expect(ladderWaitMinutes(100)).toBe(1.5);
  });
});
