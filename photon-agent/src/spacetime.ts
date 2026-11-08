import type { Account, Building, Checkin, Db, Disaster, Household, Snapshot, Summary, Task } from './types.ts';

interface SqlResult {
  schema: { elements: { name: { some: string } | string }[] };
  rows: unknown[][];
}

const columnName = (e: SqlResult['schema']['elements'][number]) =>
  (typeof e.name === 'string' ? e.name : e.name.some).replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());

export class SpacetimeHttp implements Db {
  private readonly url: string;
  private readonly db: string;
  private readonly token: string;

  constructor(url: string, db: string, token: string) {
    this.url = url.replace(/\/$/, '');
    this.db = db;
    this.token = token;
  }

  private async sql<T>(query: string): Promise<T[]> {
    const res = await fetch(`${this.url}/v1/database/${this.db}/sql`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'content-type': 'text/plain' },
      body: query,
    });
    if (!res.ok) throw new Error(`SpacetimeDB SQL ${res.status}: ${await res.text()}`);
    const [first] = (await res.json()) as SqlResult[];
    if (!first) return [];
    const names = first.schema.elements.map(columnName);
    return first.rows.map((row) => Object.fromEntries(row.map((v, i) => [names[i], v])) as T);
  }

  private async call(reducer: string, args: unknown[]) {
    const res = await fetch(`${this.url}/v1/database/${this.db}/call/${reducer}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(args, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)),
    });
    if (!res.ok) throw new Error(`SpacetimeDB ${reducer} ${res.status}: ${await res.text()}`);
  }

  async snapshot(): Promise<Snapshot> {
    const [households, buildings, disasters, checkins, accounts, tasks, summary] = await Promise.all([
      this.sql<Household>('SELECT * FROM household'),
      this.sql<Building>('SELECT * FROM building'),
      this.sql<Disaster>('SELECT * FROM disaster'),
      this.sql<Checkin>('SELECT * FROM checkin'),
      this.sql<Account>('SELECT * FROM accounting'),
      this.sql<Task>('SELECT * FROM help_task'),
      this.sql<Summary>('SELECT * FROM headcount_summary'),
    ]);
    return { households, buildings, disasters, checkins, accounts, tasks, summary: summary[0] ?? null };
  }

  linkHousehold = (householdId: number) => this.call('link_agent_household', [householdId]);
  recordClaim = (c: { householdId: number; sourceKey: string; relation: string; firsthand: boolean; kind: string; detail: string }) =>
    this.call('record_claim', [c.householdId, c.sourceKey, c.relation, c.firsthand, c.kind, c.detail]);
  proposeTask = (householdId: number, helperLabel: string, reason: string) => this.call('propose_help_task', [householdId, helperLabel, reason]);
  approveTask = (id: bigint | number, by: string) => this.call('approve_help_task', [id, by]);
  updateTask = (id: bigint | number, state: string, helperLabel: string) => this.call('update_help_task', [id, state, helperLabel]);
}
