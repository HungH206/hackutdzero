import type { View } from '../../data/derive';
import type { IconName } from '../Icon';

export interface Concern {
  key: string;
  tone: 'crit' | 'warn' | 'info';
  icon: IconName;
  title: string;
  ref: string;
  text: string;
  target?: number;
}

/** What needs a human right now, built only from server rows. */
export function concernsOf(view: View): Concern[] {
  const out: Concern[] = [];
  const c = view.counts;
  for (const h of view.households.filter((x) => view.node.get(x.id)?.flame && x.finalState !== 'assisted'))
    out.push({ key: `f${h.id}`, tone: 'crit', icon: 'flame', title: 'Fire in unit', ref: `${view.building.get(h.buildingId)?.name ?? ''} ${h.unit}`, text: `${h.name}: flame sensor tripped. Neighbors in the building are exposed.`, target: h.id });
  const clocks = view.queue.filter((h) => (view.prio.get(h.id)?.tthMin ?? -1) >= 0).sort((a, b) => view.prio.get(a.id)!.tthMin - view.prio.get(b.id)!.tthMin);
  for (const h of clocks.slice(0, 2)) {
    const m = Math.round(view.prio.get(h.id)!.tthMin);
    out.push({ key: `p${h.id}`, tone: m < 60 ? 'crit' : 'warn', icon: 'zap', title: 'Power-loss clock', ref: h.medicalDevice, text: `${h.name}: ${m} min of backup power left.`, target: h.id });
  }
  const help = view.households.filter((h) => h.finalState === 'found_needs_help');
  if (help.length)
    out.push({ key: 'help', tone: 'crit', icon: 'alert', title: 'Asked for help', ref: `${help.length} homes`, text: help.slice(0, 3).map((h) => h.name).join(', ') + (help.length > 3 ? ` +${help.length - 3}` : ''), target: help[0]!.id });
  const silent = view.queue.filter((h) => view.node.get(h.id) && !view.node.get(h.id)!.online && !view.prio.get(h.id)?.commsOutage);
  if (silent.length) out.push({ key: 'silent', tone: 'warn', icon: 'wifiOff', title: 'Gone silent', ref: `${silent.length} nodes`, text: 'Heartbeat stopped after the event. Silence is a signal.', target: silent[0]!.id });
  if (c.unknown) out.push({ key: 'unknown', tone: 'info', icon: 'search', title: 'No sensor, status unknown', ref: `${c.unknown} homes`, text: 'Not counted as safe. Needs a door knock to resolve.', target: view.households.find((h) => !h.hasSensor)?.id });
  return out;
}
