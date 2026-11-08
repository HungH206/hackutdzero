import { describe, expect, it } from 'vitest';
import { CHECKIN_C, SKIP_TO_DISPATCH_HPI, aging, band, clockK, exposure, ladderWaitMinutes, reason, score, shakingIntensity, silence, timeToHarm, vulnerability } from '../src/hpi';

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

// Behavior of each factor, as documented in docs/HPI.md.
describe('factor behavior', () => {
  const base = { E: 0.5, S: 0.5, C: 0.35, V: 0.4, K: 1.1, A: 2, override: 0, flame: false };

  it('is deterministic: the same inputs always give the same score', () => {
    const first = score(base);
    for (let i = 0; i < 50; i++) expect(score({ ...base })).toEqual(first);
  });

  it('never decreases when any single need factor increases', () => {
    const steps = [0, 0.25, 0.5, 0.75, 1];
    for (const k of ['E', 'S', 'C', 'V'] as const) {
      const scores = steps.map((v) => score({ ...base, [k]: v }).hpi);
      expect(scores, k).toEqual([...scores].sort((a, b) => a - b));
    }
    const ks = [1, 1.25, 1.5].map((K) => score({ ...base, K }).hpi);
    expect(ks).toEqual([...ks].sort((a, b) => a - b));
    const as = [0, 5, 10].map((A) => score({ ...base, A }).hpi);
    expect(as).toEqual([...as].sort((a, b) => a - b));
  });

  it('weights: L sums to 1, M is within [0.5, 1], K is within [1, 1.5]', () => {
    expect(score({ ...base, E: 1, S: 1, C: 1, flame: false }).L).toBeCloseTo(1);
    expect(score({ ...base, V: 0 }).M).toBe(0.5);
    expect(score({ ...base, V: 1 }).M).toBe(1);
    expect(clockK({ poweredMedical: true, minutesSincePowerLoss: 1e6, backupRuntimeMin: 180, flame: true })).toBeLessThanOrEqual(1.5);
    expect(clockK({ poweredMedical: false, minutesSincePowerLoss: null, backupRuntimeMin: 0, flame: false })).toBe(1);
  });

  it('help floor and fire floor lift L to at least 0.9 even when everything else is zero', () => {
    expect(score({ E: 0, S: 0, C: 1, V: 0, K: 1, A: 0, override: 0, flame: false }).L).toBe(0.9);
    expect(score({ E: 0, S: 0, C: 0, V: 0, K: 1.5, A: 0, override: 0, flame: true }).L).toBe(0.9);
    expect(score({ E: 0, S: 0, C: 0.7, V: 0, K: 1, A: 0, override: 0, flame: false }).L).toBeCloseTo(0.175);
  });

  it('shaking only counts when the event was confirmed by neighbors', () => {
    expect(shakingIntensity(1, 30, false)).toBe(0);
    expect(shakingIntensity(1, 30, true)).toBe(1);
    expect(shakingIntensity(0.5, 15, true)).toBeCloseTo(0.5);
  });

  it('silence: zero at zero minutes, saturates at 20 minutes, and the discounts compose', () => {
    expect(silence({ minutesSilent: 0, abrupt: false, recentMotion: false, commsOutage: false })).toBe(0);
    expect(silence({ minutesSilent: 10, abrupt: false, recentMotion: false, commsOutage: false })).toBeCloseTo(0.5);
    expect(silence({ minutesSilent: 99, abrupt: false, recentMotion: false, commsOutage: false })).toBe(1);
    expect(silence({ minutesSilent: 99, abrupt: true, recentMotion: false, commsOutage: false })).toBe(1);
    expect(silence({ minutesSilent: 20, abrupt: false, recentMotion: true, commsOutage: true })).toBeCloseTo(0.25);
  });

  it('check-in values: OK is 0, help is 1, and an unanswered prompt rises from 0.35 to 0.7', () => {
    expect(CHECKIN_C).toEqual({ ok: 0, pending: 0.35, no_response: 0.7, help: 1 });
  });

  it('vulnerability: each flag has its documented weight, the cap is 1, and age 75 is the line', () => {
    const none = { poweredMedical: false, age: 40, mobilityLimited: false, livesAlone: false, languageBarrier: false, infant: false };
    expect(vulnerability(none)).toBe(0);
    expect(vulnerability({ ...none, poweredMedical: true })).toBeCloseTo(0.35);
    expect(vulnerability({ ...none, age: 74 })).toBe(0);
    expect(vulnerability({ ...none, age: 75 })).toBeCloseTo(0.25);
    expect(vulnerability({ ...none, mobilityLimited: true })).toBeCloseTo(0.25);
    expect(vulnerability({ ...none, livesAlone: true })).toBeCloseTo(0.15);
    expect(vulnerability({ ...none, languageBarrier: true })).toBeCloseTo(0.15);
    expect(vulnerability({ ...none, infant: true })).toBeCloseTo(0.1);
    expect(vulnerability({ poweredMedical: true, age: 90, mobilityLimited: true, livesAlone: true, languageBarrier: true, infant: true })).toBe(1);
  });

  it('power-loss clock: only for powered medical equipment, counts down to zero, K runs 1.0 to 1.5', () => {
    const on = { poweredMedical: true, backupRuntimeMin: 180, flame: false };
    expect(timeToHarm({ ...on, minutesSincePowerLoss: null })).toBeNull();
    expect(timeToHarm({ ...on, poweredMedical: false, minutesSincePowerLoss: 10 })).toBeNull();
    expect(timeToHarm({ ...on, minutesSincePowerLoss: 60 })).toBe(120);
    expect(timeToHarm({ ...on, minutesSincePowerLoss: 500 })).toBe(0);
    expect(clockK({ ...on, minutesSincePowerLoss: 0 })).toBeCloseTo(1.125); // 180 of 240 minutes left
    expect(clockK({ ...on, minutesSincePowerLoss: 500 })).toBe(1.5);
    expect(clockK({ ...on, backupRuntimeMin: 600, minutesSincePowerLoss: 0 })).toBe(1); // more than 240 min of runway
  });

  it('bands change exactly at 25, 50 and 75', () => {
    expect([24.9, 25, 49.9, 50, 74.9, 75].map(band)).toEqual(['low', 'guarded', 'guarded', 'high', 'high', 'critical']);
  });

  it('ladder wait never increases as HPI increases, and the skip threshold is documented at 85', () => {
    const waits = [0, 25, 50, 75, 100].map(ladderWaitMinutes);
    expect(waits).toEqual([...waits].sort((a, b) => b - a));
    expect(SKIP_TO_DISPATCH_HPI).toBe(85);
  });

  it('the reason names the evidence, and says "verify" rather than "hurt" for unexplained silence', () => {
    const r = reason({
      age: 40, medicalDevice: '', mobilityLimited: false, livesAlone: false, languageBarrier: false, language: 'English', infant: false,
      shaking: 0, flame: false, neighborFire: false, tempRiseC: 0, checkin: 'none', minutesSilent: null, recentMotion: false,
      commsOutage: false, tth: null, override: 0, offlineMin: 12, preEventOffline: false,
    });
    expect(r).toContain('verify (not assumed hurt)');
    expect(r.replace('not assumed hurt', '')).not.toMatch(/injur|hurt/); // the only mention of "hurt" is the denial
  });
});
