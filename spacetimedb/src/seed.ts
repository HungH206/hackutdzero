// Synthetic neighborhood for the demo: "Cedar Hollow", a fictional place.
// No real people or addresses. Map coordinates are abstract units on a
// 1000 x 640 plan that the dashboard draws itself (no internet tiles).

export type SimBehavior =
  | 'ok' // answers "I'm OK" after a short delay
  | 'late_ok' // answers "I'm OK" late, after the ladder has started
  | 'help' // presses "I need help"
  | 'no_answer' // node keeps working but nobody presses a button
  | 'silent'; // node goes offline abruptly at the moment of the event

export interface SeedBuilding {
  id: number;
  name: string;
  kind: 'multifamily' | 'office' | 'warehouse';
  x: number;
  y: number;
  w: number;
  h: number;
  floors: number;
  builtYear: number;
  risk: number;
}

export interface SeedHousehold {
  id: number;
  buildingId: number;
  floor: number;
  unit: string;
  name: string;
  x: number;
  y: number;
  age: number;
  medicalDevice: string;
  backupRuntimeMin: number;
  mobilityLimited: boolean;
  livesAlone: boolean;
  language: string;
  infant: boolean;
  hasSensor: boolean;
  hero: string;
  simBehavior: SimBehavior;
  simDelayMin: number;
  /** Simulated emergency-contact outcome at ladder step 2. */
  simContact: 'reaches_ok' | 'no_answer';
  /** Simulated neighbor/volunteer knock outcome at ladder step 3. */
  simKnock: 'found_ok' | 'found_needs_help' | 'no_answer';
}

// Building risk B: older and taller buildings score higher.
export const BUILDINGS: SeedBuilding[] = [
  { id: 1, name: 'Alder Court', kind: 'multifamily', x: 140, y: 120, w: 170, h: 110, floors: 3, builtYear: 1962, risk: 0.85 },
  { id: 2, name: 'Birch Row', kind: 'multifamily', x: 400, y: 110, w: 190, h: 100, floors: 2, builtYear: 1978, risk: 0.6 },
  { id: 3, name: 'Cypress Flats', kind: 'multifamily', x: 680, y: 130, w: 180, h: 110, floors: 4, builtYear: 1995, risk: 0.45 },
  { id: 4, name: 'Dogwood Terrace', kind: 'multifamily', x: 160, y: 400, w: 180, h: 120, floors: 3, builtYear: 1971, risk: 0.7 },
  { id: 5, name: 'Elm Gardens', kind: 'multifamily', x: 440, y: 390, w: 170, h: 120, floors: 2, builtYear: 2008, risk: 0.3 },
  { id: 6, name: 'Hollow Works (office)', kind: 'office', x: 720, y: 380, w: 150, h: 90, floors: 5, builtYear: 2001, risk: 0.4 },
  { id: 7, name: 'Creekside Depot (warehouse)', kind: 'warehouse', x: 760, y: 530, w: 170, h: 70, floors: 1, builtYear: 1988, risk: 0.5 },
];

/** A block with no sensors at all, drawn as hatched "unknown" on the map. */
export const UNKNOWN_ZONE = { x: 40, y: 560, w: 300, h: 70, label: 'Maple St. trailers: no sensors' };

const HEROES: Omit<SeedHousehold, 'id' | 'x' | 'y'>[] = [
  {
    buildingId: 1, floor: 1, unit: '1A', name: 'Mrs. Alvarez', age: 82, medicalDevice: 'oxygen concentrator', backupRuntimeMin: 180,
    mobilityLimited: true, livesAlone: true, language: 'English', infant: false, hasSensor: true, hero: 'Oxygen, lives alone, silent',
    simBehavior: 'silent', simDelayMin: 0, simContact: 'no_answer', simKnock: 'found_needs_help',
  },
  {
    buildingId: 1, floor: 2, unit: '2C', name: 'J. Brooks', age: 30, medicalDevice: '', backupRuntimeMin: 0,
    mobilityLimited: false, livesAlone: false, language: 'English', infant: false, hasSensor: true, hero: 'Healthy, near epicenter, silent',
    simBehavior: 'silent', simDelayMin: 0, simContact: 'reaches_ok', simKnock: 'found_ok',
  },
  {
    buildingId: 3, floor: 3, unit: '3B', name: 'Mr. Chen', age: 77, medicalDevice: '', backupRuntimeMin: 0,
    mobilityLimited: false, livesAlone: true, language: 'English', infant: false, hasSensor: true, hero: 'Fire unit',
    simBehavior: 'no_answer', simDelayMin: 0, simContact: 'no_answer', simKnock: 'no_answer',
  },
  {
    buildingId: 4, floor: 2, unit: '2A', name: 'The Patel family', age: 34, medicalDevice: '', backupRuntimeMin: 0,
    mobilityLimited: false, livesAlone: false, language: 'English', infant: true, hasSensor: true, hero: 'Family with infant',
    simBehavior: 'help', simDelayMin: 2, simContact: 'no_answer', simKnock: 'found_needs_help',
  },
  {
    buildingId: 2, floor: 1, unit: '1B', name: 'Mr. Tran', age: 68, medicalDevice: '', backupRuntimeMin: 0,
    mobilityLimited: true, livesAlone: true, language: 'Vietnamese', infant: false, hasSensor: true, hero: 'Non-English speaker',
    simBehavior: 'no_answer', simDelayMin: 0, simContact: 'no_answer', simKnock: 'found_ok',
  },
];

const FIRST = ['A.', 'B.', 'C.', 'D.', 'E.', 'F.', 'G.', 'H.', 'I.', 'K.', 'L.', 'M.', 'N.', 'O.', 'P.', 'R.', 'S.', 'T.', 'V.', 'W.'];
const LAST = ['Rivera', 'Kim', 'Okafor', 'Singh', 'Novak', 'Haddad', 'Lindqvist', 'Mensah', 'Ortiz', 'Yamada', 'Costa', 'Abara',
  'Fischer', 'Duarte', 'Lee', 'Moreau', 'Petrov', 'Garza', 'Osei', 'Walsh', 'Ibarra', 'Shah', 'Morgan', 'Reyes', 'Park', 'Bauer',
  'Nakamura', 'Quinn', 'Adeyemi', 'Lopez', 'Hughes', 'Dang', 'Romero', 'Ali', 'Sato'];
const DEVICES = ['oxygen concentrator', 'home dialysis', 'CPAP machine', 'powered wheelchair'];
const LANGS = ['Spanish', 'Vietnamese', 'Mandarin', 'Arabic'];

/** Small deterministic PRNG so every reset produces the same neighborhood. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function seedHouseholds(): SeedHousehold[] {
  const rnd = lcg(20261108);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)]!;
  const out: SeedHousehold[] = [];
  const unitsByBuilding: Record<number, string[]> = {};
  const homes = BUILDINGS.filter((b) => b.kind === 'multifamily');

  const place = (h: Omit<SeedHousehold, 'id' | 'x' | 'y'>) => {
    const b = BUILDINGS.find((x) => x.id === h.buildingId)!;
    const taken = (unitsByBuilding[b.id] ??= []);
    taken.push(h.unit);
    const i = taken.length - 1;
    // Lay units out on a 4-column grid inside the building footprint.
    const col = i % 4;
    const row = Math.floor(i / 4);
    out.push({
      ...h,
      id: out.length + 1,
      x: b.x + 22 + col * ((b.w - 44) / 3),
      y: b.y + 24 + row * 30,
    });
  };

  for (const h of HEROES) place(h);

  // 33 more ordinary households in the five apartment buildings.
  let n = 0;
  while (out.length < 38) {
    const b = homes[n % homes.length]!;
    n++;
    const used = unitsByBuilding[b.id] ?? [];
    if (used.length >= 8) continue;
    let floor = 1;
    let unit = '';
    do {
      floor = 1 + Math.floor(rnd() * b.floors);
      unit = `${floor}${'ABCD'[Math.floor(rnd() * 4)]}`;
    } while (used.includes(unit));
    const age = 20 + Math.floor(rnd() * 70);
    const hasDevice = rnd() < 0.15;
    const r = rnd();
    const simBehavior: SimBehavior = r < 0.5 ? 'ok' : r < 0.62 ? 'late_ok' : r < 0.72 ? 'help' : r < 0.86 ? 'no_answer' : 'silent';
    place({
      buildingId: b.id,
      floor,
      unit,
      name: `${pick(FIRST)} ${pick(LAST)}`,
      age,
      medicalDevice: hasDevice ? pick(DEVICES) : '',
      backupRuntimeMin: hasDevice ? 60 + Math.floor(rnd() * 5) * 60 : 0,
      mobilityLimited: age >= 70 ? rnd() < 0.5 : rnd() < 0.08,
      livesAlone: rnd() < 0.35,
      language: rnd() < 0.15 ? pick(LANGS) : 'English',
      infant: age < 45 && rnd() < 0.15,
      hasSensor: true,
      hero: '',
      simBehavior,
      simDelayMin: simBehavior === 'late_ok' ? 9 + Math.floor(rnd() * 6) : 1 + Math.floor(rnd() * 3),
      simContact: rnd() < 0.5 ? 'reaches_ok' : 'no_answer',
      simKnock: rnd() < 0.5 ? 'found_ok' : rnd() < 0.5 ? 'found_needs_help' : 'no_answer',
    });
  }

  // Two homes in the unknown zone: on the map and in the count, never scored.
  for (let i = 0; i < 2; i++) {
    out.push({
      id: out.length + 1,
      buildingId: 0,
      floor: 1,
      unit: `Lot ${i + 3}`,
      name: 'No sensor',
      x: UNKNOWN_ZONE.x + 80 + i * 140,
      y: UNKNOWN_ZONE.y + 38,
      age: 0,
      medicalDevice: '',
      backupRuntimeMin: 0,
      mobilityLimited: false,
      livesAlone: false,
      language: 'English',
      infant: false,
      hasSensor: false,
      hero: '',
      simBehavior: 'silent',
      simDelayMin: 0,
      simContact: 'no_answer',
      simKnock: 'no_answer',
    });
  }
  return out;
}
