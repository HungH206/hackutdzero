import type { ReactNode } from 'react';
import { clockText, type View } from '../data/derive';
import type { ConnectionInfo } from '../data/types';
import { Icon, type IconName } from './Icon';

interface Props {
  view: View;
  now: number;
  offsetMicros: number;
  connection: ConnectionInfo;
  unread: number;
  onBell(): void;
  onSearch(): void;
  demo: ReactNode;
}

export function TopBar({ view, now, offsetMicros, connection, unread, onBell, onSearch, demo }: Props) {
  const c = view.counts;
  const offline = [...view.node.values()].filter((n) => !n.online).length;
  const battery = [...view.node.values()].filter((n) => n.onBattery).length;
  const critical = view.queue.filter((h) => view.prio.get(h.id)?.band === 'critical').length;
  const fires = [...view.node.values()].filter((n) => n.flame).length;
  const pills: { icon: IconName; label: string; value: string; tone?: string }[] = view.disasterActive
    ? [
        { icon: 'alert', label: 'Critical', value: String(critical), tone: critical ? 'crit' : undefined },
        { icon: 'users', label: 'Needs help', value: String(c.help), tone: c.help ? 'crit' : undefined },
        { icon: 'wifiOff', label: 'Nodes silent', value: String(offline), tone: offline ? 'warn' : undefined },
        { icon: 'zap', label: 'On battery', value: String(battery), tone: battery ? 'warn' : undefined },
        ...(fires ? [{ icon: 'flame' as IconName, label: 'Fire', value: String(fires), tone: 'crit' }] : []),
      ]
    : [
        { icon: 'radio', label: 'Nodes online', value: `${view.node.size - offline}/${view.node.size}` },
        { icon: 'zap', label: 'On battery', value: String(battery) },
        { icon: 'shield', label: 'Status', value: 'All clear', tone: 'good' },
      ];
  const ff = Math.round(offsetMicros / 6e7);
  const pct = c.total ? Math.round((c.accounted / c.total) * 100) : 0;

  return (
    <header className="topbar">
      <div className="headline glass">
        <div className="eyebrow">{view.disasterActive ? 'Accounted for' : 'Monitoring'}</div>
        <div className="headline-num" aria-live="polite">
          {view.disasterActive ? (
            <>
              <b>{c.accounted}</b>
              <span>/{c.total}</span>
            </>
          ) : (
            <>
              <b>{c.total}</b>
              <span> homes</span>
            </>
          )}
        </div>
        {view.disasterActive && (
          <div className="headline-bar" role="img" aria-label={`${pct}% accounted for`}>
            <i style={{ flexGrow: c.ok, background: 'var(--ok)' }} />
            <i style={{ flexGrow: c.help, background: 'var(--critical)' }} />
            <i style={{ flexGrow: c.assisted, background: 'var(--assisted)' }} />
            <i style={{ flexGrow: c.unresolved, background: 'var(--line)' }} />
            <i style={{ flexGrow: c.unknown, background: 'repeating-linear-gradient(45deg,#334155 0 3px,transparent 3px 6px)' }} />
          </div>
        )}
      </div>

      <div className="pills">
        {pills.map((p) => (
          <div key={p.label} className={`pill glass ${p.tone ?? ''}`}>
            <Icon name={p.icon} size={15} />
            <span className="pill-lbl">{p.label}</span>
            <b>{p.value}</b>
          </div>
        ))}
      </div>

      <div className="top-right">
        <button className="searchbox glass" onClick={onSearch} aria-label="Find a household (Command K)">
          <Icon name="search" size={16} />
          <span>Find household or run command</span>
          <kbd>⌘K</kbd>
        </button>
        <button className="icon-btn glass" onClick={onBell} aria-label={`Alerts, ${unread} unread`}>
          <Icon name="bell" size={18} />
          {unread > 0 && <span className="dot-badge">{unread > 9 ? '9+' : unread}</span>}
        </button>
        <div className="clock glass" title="Scenario time">
          <Icon name="clock" size={15} />
          <span className="mono">{clockText(now)}</span>
          {ff > 0 && <span className="ff">+{ff}m</span>}
        </div>
        <div className={`conn glass ${connection.status}`} title={connection.detail}>
          <span className="conn-dot" />
          <span>{connection.source === 'local' ? 'Local fallback' : connection.status === 'live' ? 'SpacetimeDB live' : 'SpacetimeDB'}</span>
        </div>
        {demo}
      </div>
    </header>
  );
}
