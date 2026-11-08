import { useState, type ReactNode } from 'react';
import { clockText } from '../../data/derive';
import type { ConnectionInfo } from '../../data/types';
import { Icon, type IconName } from '../Icon';
import type { GraphFilter } from './Graph';

export type Screen = 'overview' | 'graph' | 'tree' | 'houses' | 'map' | 'analytics' | 'log';

interface Props {
  screen: Screen;
  onScreen(s: Screen): void;
  zoom: number;
  onZoom(z: number): void;
  filter: GraphFilter;
  onFilter(f: GraphFilter): void;
  openCount: number;
  unread: number;
  now: number;
  offsetMicros: number;
  connection: ConnectionInfo;
  onSearch(): void;
  onBell(): void;
  demo: ReactNode;
}

// One website: every screen is a tab in the same top bar.
export const NAV: { id: Screen; label: string; icon: IconName; hint: string }[] = [
  { id: 'analytics', label: 'Dashboard', icon: 'chart', hint: 'Is everyone being found? The big picture.' },
  { id: 'graph', label: 'Command', icon: 'globe', hint: '3D Cedar Hollow with the dispatch queue' },
  { id: 'map', label: 'Map', icon: 'map', hint: 'Every home on the map, top-down or tilted' },
  { id: 'tree', label: 'Buildings', icon: 'route', hint: 'Who in each building still needs reaching' },
  { id: 'overview', label: 'Units', icon: 'layers', hint: 'Floor-by-floor units and the waiting list' },
];


export function Header(p: Props) {
  const [menu, setMenu] = useState(false);
  const ff = Math.round(p.offsetMicros / 6e7);
  return (
    <header className="py-head">
      <div className="py-brand">
        <button className="py-sq" onClick={() => setMenu((m) => !m)} aria-label="Views" aria-expanded={menu}>
          <Icon name="list" size={18} />
        </button>
        <span className="py-logo" aria-hidden="true">
          <Icon name="house" size={16} />
        </span>
        <div className="py-brand-t">
          <b>Headcount</b>
          <span>Cedar Hollow · simulated</span>
        </div>
        {menu && (
          <nav className="py-menu" aria-label="Views">
            {NAV.map((n) => (
              <button
                key={n.id}
                className={p.screen === n.id ? 'on' : ''}
                onClick={() => {
                  p.onScreen(n.id);
                  setMenu(false);
                }}
              >
                <Icon name={n.icon} size={16} /> {n.label}
              </button>
            ))}
            <a className="py-menu-link" href="/?app=agent" onClick={() => setMenu(false)}>
              <Icon name="home" size={16} /> State Farm agent view
            </a>
          </nav>
        )}
      </div>

      <div className="py-tools">
        <nav className="hc-nav" aria-label="Screens">
          {NAV.map((n) => {
            const on = p.screen === n.id || (n.id === 'map' && p.screen === 'houses');
            return (
              <button key={n.id} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined} title={n.hint} onClick={() => p.onScreen(n.id)}>
                <Icon name={n.icon} size={16} />
                <span>{n.label}</span>
                {n.id === 'graph' && p.openCount > 0 && <em>{p.openCount > 99 ? '99' : p.openCount}</em>}
              </button>
            );
          })}
        </nav>
        <div className="py-group solo">
          <button className={p.screen === 'log' ? 'on' : ''} onClick={p.onBell} aria-label={`Event log, ${p.unread} unread`} title="Event log">
            <Icon name="bell" size={18} />
            {p.unread > 0 && <span className="py-dot red">{p.unread > 9 ? '9+' : p.unread}</span>}
          </button>
        </div>
      </div>

      <div className="py-right">
        {p.demo}
        <span className="py-sim" title="Every household, sensor reading and responder here is synthetic. No real emergency service is contacted.">
          Simulation
        </span>
        <span className="py-clock mono" title="Scenario time">
          {clockText(p.now)}
          {ff > 0 && <em>+{ff}m</em>}
        </span>
        <button className="py-round" onClick={p.onSearch} aria-label="Search households (Command K)">
          <Icon name="search" size={17} />
        </button>
        <span className={`py-conn ${p.connection.status}`} title={p.connection.detail}>
          <i />
          {p.connection.source === 'local' ? 'Local' : 'Live'}
        </span>
      </div>
    </header>
  );
}
