import { Photon } from '@photon-ai/api';
import { io } from 'socket.io-client';
import type { Contact, Inbound, Send } from './types.ts';
import type { Store } from './store.ts';

export function photonClient(key: string) {
  return new Photon({ headers: { Authorization: `Bearer ${key}` } });
}

export function photonSend(photon: Photon, project: string): Send {
  return async (to: Contact, text: string, idempotencyKey: string) => {
    if (!to.spaceId || !to.agentId) throw new Error(`${to.name} has not texted the line yet.`);
    await photon.projects.sendMessage({
      path: { id: project },
      headers: { 'idempotency-key': idempotencyKey },
      body: { spaceId: to.spaceId, senderId: to.agentId, content: { type: 'text', format: 'plain', text } },
    });
  };
}

/** Adds a person to the shared line. Each person can be given a different number to text. */
export async function assignLine(photon: Photon, project: string, handle: string): Promise<string> {
  const assignment = await photon.projects.platforms.imessage.assignments.create({
    path: { id: project },
    headers: { idempotencyKey: `headcount-enroll:${handle}` },
    body: { handle },
  });
  return assignment.assignedPhoneNumber;
}

export function parseInbound(event: any): Inbound | null {
  if (event?.type !== 'message.received') return null;
  const m = event.data?.object;
  if (!m || m.sentBy?.kind !== 'human' || m.receivedBy?.kind !== 'agent') return null;
  if (m.space?.kind && m.space.kind !== 'direct') return null;
  const parts = m.content?.type === 'group' ? m.content.parts : [m.content];
  const text = (parts ?? []).filter((p: any) => p?.type === 'text').map((p: any) => p.text).join('\n').trim();
  if (!text) return null;
  return { id: m.id, handle: m.sentBy.handle, spaceId: m.space.id, agentId: m.receivedBy.id, text };
}

/** Runs one event at a time and only saves the cursor after the handler succeeds. */
export function subscribe(project: string, key: string, store: Store, handle: (m: Inbound) => Promise<void>) {
  let queue = Promise.resolve();
  const socket = io('https://api.photon.codes', {
    path: `/v1/projects/${project}/events/ws`,
    addTrailingSlash: false,
    transports: ['websocket'],
    extraHeaders: { Authorization: `Bearer ${key}` },
    autoConnect: false,
  });
  socket.on('connect', () => {
    socket.timeout(10_000).emit('subscribe', { startSeq: store.cursor() }, (error: unknown, result: any) => {
      if (error) socket.io.engine.close();
      else if (!result.ok) console.error('Photon subscribe refused:', result.error?.code);
      else console.log('Photon connected. Listening for texts.');
    });
  });
  socket.on('delivery', (event: unknown, meta: { seq: number }) => {
    queue = queue.then(async () => {
      if (meta.seq <= store.cursor()) return;
      const inbound = parseInbound(event);
      if (inbound) await handle(inbound);
      store.setCursor(meta.seq);
    }).catch((error) => {
      console.error('Failed handling a message, reconnecting to replay it:', error);
      socket.io.engine.close();
    });
  });
  socket.on('delivery_error', (error: { code?: string }) => console.error('Photon delivery error:', error.code));
  socket.on('connect_error', (error: Error) => console.error('Photon connection error:', error.message));
  socket.connect();
  return socket;
}
