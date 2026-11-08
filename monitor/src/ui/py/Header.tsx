import { useState, type ReactNode } from 'react';
import { clockText } from '../../data/derive';
import type { ConnectionInfo } from '../../data/types';
import { Icon, type IconName } from '../Icon';
import type { GraphFilter } from './Graph';

export type Screen = 'graph' | 'tree' | 'map' | 'analytics' | 'log';

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

const NAV: { id: Screen; label: string; icon: IconName }[] = [
  { id: 'graph', label: 'Network graph', icon: 'globe' },
  { id: 'tree', label: 'Building view', icon: 'route' },
  { id: 'map', label: 'Live map', icon: 'map' },
  { id: 'analytics', label: 'Analytics', icon: 'chart' },
  { id: 'log', label: 'Event log', icon: 'list' },
];

export function Header(p: Props) {
  const [menu, setMenu] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const ff = Math.round(p.offsetMicros / 6e7);
  const graphish = p.screen === 'graph' || p.screen === 'tree';
  return (
    <header className="py-head">
      <div className="py-brand">
        <button className="py-sq" onClick={() => setMenu((m) => !m)} aria-label="Views" aria-expanded={menu}>
          <Icon name="list" size={18} />
        </button>
        <svg viewBox="0 0 36 36" width="34" height="34" aria-hidden="true" className="py-logo">
          <path d="M12 3h12v6h-4v4h-4V9h-4zM3 12h6v4h4v4H9v4H3zM33 12h-6v4h-4v4h4v4h6zM12 33h12v-6h-4v-4h-4v4h-4z" fill="none" stroke="#e2bf7b" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M18 12.5l1.6 4 4 1.5-4 1.5-1.6 4-1.6-4-4-1.5 4-1.5z" fill="#fff4dc" />
        </svg>
        <div className="py-brand-t">
          <b>Headcount</b>
          <span>Disaster Response</span>
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
          </nav>
        )}
      </div>

      <div className="py-tools" role="toolbar" aria-label="View controls">
        <div className="py-group">
          <button className={p.screen === 'graph' ? 'on' : ''} onClick={() => p.onScreen('graph')} aria-label="Network graph" title="Network graph">
            <Icon name="globe" size={18} />
          </button>
          <button className={p.screen === 'tree' ? 'on' : ''} onClick={() => p.onScreen('tree')} aria-label="Building view" title="Building view">
            <Icon name="route" size={18} />
          </button>
          <button className={p.screen === 'map' ? 'on' : ''} onClick={() => p.onScreen('map')} aria-label="Live map" title="Live map">
            <Icon name="map" size={18} />
          </button>
        </div>
        <div className="py-group">
          <button onClick={() => p.onZoom(Math.min(2.4, p.zoom * 1.25))} disabled={!graphish} aria-label="Zoom in">
            <Icon name="plus" size={18} />
          </button>
          <button onClick={() => p.onZoom(Math.max(0.6, p.zoom / 1.25))} disabled={!graphish} aria-label="Zoom out">
            <Icon name="minus" size={18} />
          </button>
        </div>
        <div className="py-group solo">
          <button className={filterOpen ? 'on' : ''} onClick={() => setFilterOpen((o) => !o)} aria-label="Filter households" aria-expanded={filterOpen} disabled={p.screen !== 'graph'}>
            <Icon name="sliders" size={18} />
            {p.filter !== 'all' && <span className="py-dot">1</span>}
          </button>
          {filterOpen && (
            <div className="py-pop" role="menu">
              {(
                [
                  ['all', 'Everyone'],
                  ['open', 'Still open'],
                  ['help', 'Critical and needs help'],
                ] as [GraphFilter, string][]
              ).map(([f, l]) => (
                <button
                  key={f}
                  role="menuitemradio"
                  aria-checked={p.filter === f}
                  className={p.filter === f ? 'on' : ''}
                  onClick={() => {
                    p.onFilter(f);
                    setFilterOpen(false);
                  }}
                >
                  {l}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="py-group solo">
          <button className={p.screen === 'analytics' ? 'on' : ''} onClick={() => p.onScreen('analytics')} aria-label="Analytics" title="Analytics">
            <Icon name="chart" size={18} />
            {p.openCount > 0 && <span className="py-dot">{p.openCount > 99 ? '99' : p.openCount}</span>}
          </button>
        </div>
        <div className="py-group solo">
          <button className={p.screen === 'log' ? 'on' : ''} onClick={p.onBell} aria-label={`Event log, ${p.unread} unread`} title="Event log">
            <Icon name="bell" size={18} />
            {p.unread > 0 && <span className="py-dot red">{p.unread > 9 ? '9+' : p.unread}</span>}
          </button>
        </div>
      </div>

      <div className="py-right">
        {p.demo}
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
