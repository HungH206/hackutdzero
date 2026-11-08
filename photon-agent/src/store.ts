import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Assignment, Contact, Language } from './types.ts';

interface State {
  contacts: Record<string, Contact>;
  processed: string[];
  sent: string[];
  assignments: Record<string, Assignment>;
  cursor: number;
}

const empty = (): State => ({ contacts: {}, processed: [], sent: [], assignments: {}, cursor: 0 });
const KEEP = 5000;

/** Phone numbers and thread ids stay in this gitignored file and never reach the shared database. */
export class Store {
  private state: State;
  private readonly file: string | null;

  constructor(file: string | null) {
    this.file = file;
    this.state = file && existsSync(file) ? { ...empty(), ...JSON.parse(readFileSync(file, 'utf8')) } : empty();
  }

  private save() {
    if (!this.file) return;
    mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.state, null, 1), { mode: 0o600 });
    renameSync(tmp, this.file);
  }

  contacts = () => Object.values(this.state.contacts);
  contact = (handle: string): Contact | undefined => this.state.contacts[handle];

  upsert(input: { handle: string; name: string; householdId: number | null; careFor: number[]; language: Language; assignedNumber: string | null }): Contact {
    const prev = this.state.contacts[input.handle];
    const next: Contact = {
      ...(prev ?? { capabilities: [], spaceId: null, agentId: null, stage: 'new' as const, stopped: false }),
      ...input,
      sourceKey: createHash('sha256').update(input.handle).digest('hex').slice(0, 16),
    };
    this.state.contacts[input.handle] = next;
    this.save();
    return next;
  }

  patch(handle: string, change: Partial<Contact>) {
    Object.assign(this.state.contacts[handle]!, change);
    this.save();
  }

  /** Replays can redeliver a message, so it only counts as handled once the work has succeeded. */
  wasProcessed = (messageId: string) => this.state.processed.includes(messageId);
  markProcessed(messageId: string) {
    this.state.processed = [...this.state.processed.slice(-KEEP), messageId];
    this.save();
  }

  wasSent = (key: string) => this.state.sent.includes(key);
  markSent(key: string) {
    this.state.sent = [...this.state.sent.slice(-KEEP), key];
    this.save();
  }

  assignment = (taskId: bigint | number): Assignment | undefined => this.state.assignments[String(taskId)];
  assignments = () => Object.entries(this.state.assignments);
  setAssignment(taskId: bigint | number, a: Assignment) {
    this.state.assignments[String(taskId)] = a;
    this.save();
  }

  cursor = () => this.state.cursor;
  setCursor(seq: number) {
    this.state.cursor = seq;
    this.save();
  }
}
