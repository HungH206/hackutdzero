import { Icon, type IconName } from './Icon';

export type ViewId = 'live' | 'network' | 'analytics' | 'log';
const ITEMS: { id: ViewId; label: string; icon: IconName }[] = [
  { id: 'live', label: 'Live map', icon: 'map' },
  { id: 'network', label: 'Network', icon: 'globe' },
  { id: 'analytics', label: 'Analytics', icon: 'chart' },
  { id: 'log', label: 'Event log', icon: 'list' },
];

export function Rail({ active, onChange, logCount }: { active: ViewId; onChange(v: ViewId): void; logCount: number }) {
  return (
    <nav className="rail glass" aria-label="Views">
      <div className="logo" aria-label="Headcount">
        <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
          <circle cx="16" cy="16" r="13" fill="none" stroke="var(--accent)" strokeWidth="2" opacity=".35" />
          <circle cx="16" cy="16" r="8" fill="none" stroke="var(--accent)" strokeWidth="2" opacity=".7" />
          <circle cx="16" cy="16" r="3.2" fill="var(--accent)" />
        </svg>
      </div>
      <div className="rail-items">
        {ITEMS.map((it) => (
          <button key={it.id} className={`rail-btn${active === it.id ? ' on' : ''}`} onClick={() => onChange(it.id)} aria-label={it.label} aria-current={active === it.id ? 'page' : undefined} data-tip={it.label}>
            <Icon name={it.icon} size={19} />
            {it.id === 'log' && logCount > 0 && <span className="rail-badge">{logCount > 99 ? '99+' : logCount}</span>}
          </button>
        ))}
      </div>
      <div className="rail-foot" data-tip="Need-based ranking only. Synthetic data.">
        <Icon name="shield" size={18} />
      </div>
    </nav>
  );
}
