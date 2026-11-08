import { useState } from 'react';
import { Icon } from '../ui/Icon';
import { BI_WAIT_H, curveAt, financeOf, sumFinance } from './finance';
import { fmtUsd, type BuildingImpact } from './model';

// "Financial impact" panel: KPI tiles, cumulative cash-flow-at-risk chart,
// loss waterfall and exposure allocation. Same staking-card language as the
// rest of the CBRE screen.

const SEG = ['#b6a6ff', '#8f7cf0', '#6a5bd0', '#ff8a9a', '#f2b45c', '#54e08c', '#5b5a69'];

interface Props {
  all: BuildingImpact[];
  cur: BuildingImpact;
  horizon: number;
  label: string;
  onSelect(id: number): void;
}

export function FinancePanel({ all, cur, horizon, label, onSelect }: Props) {
  const [scope, setScope] = useState<'portfolio' | 'building'>('portfolio');
  const xs = scope === 'portfolio' ? all : [cur];
  const fs = xs.map((x) => financeOf(x, horizon));
  const t = sumFinance(fs);
  const byRetained = all.map((x) => financeOf(x, horizon)).sort((a, b) => b.retained - a.retained);
  const allRetained = byRetained.reduce((m, f) => m + f.retained, 0);
  const recovery = t.propClaim + t.rentClaim;

  return (
    <section className="cb-panel" id="finance">
      <div className="cb-panel-h">
        <span>Financial impact</span>
        <div className="cb-scope" role="tablist" aria-label="Scope">
          <button role="tab" aria-selected={scope === 'portfolio'} className={scope === 'portfolio' ? 'on' : ''} onClick={() => setScope('portfolio')}>
            Portfolio
          </button>
          <button role="tab" aria-selected={scope === 'building'} className={scope === 'building' ? 'on' : ''} onClick={() => setScope('building')}>
            {cur.name}
          </button>
        </div>
      </div>

      <div className="cb-kpis">
        <Kpi label="Gross loss" tag={label} value={fmtUsd(t.gross)} sub={`${fmtUsd(t.revenue)} rent · ${fmtUsd(t.repairs)} repairs`} />
        <Kpi label="Insured recovery" tag="Claims" value={fmtUsd(recovery)} sub={`${t.gross ? Math.round((recovery / t.gross) * 100) : 0}% of gross`} tone="good" />
        <Kpi label="Retained loss" tag="Net" value={fmtUsd(t.retained)} sub={`Deductibles ${fmtUsd(t.deductible)}`} tone="bad" />
        <Kpi label="NOI impact" tag="Annual" value={(t.noiHit * 100).toFixed(1)} unit="%" sub={`of ${fmtUsd(t.annualNoi)} NOI`} meter={Math.min(1, t.noiHit / 0.25)} />
      </div>

      <div className="cb-fin-grid">
        <div className="cb-card">
          <div className="cb-card-h">
            <span>
              <b>Cash flow at risk</b>
              <small>Cash out over the next {label} as rent is lost and repairs are paid, before and after insurance</small>
            </span>
            <span className="cb-legend">
              <span>
                <i className="lav" /> Gross
              </span>
              <span>
                <i className="wht" /> Retained
              </span>
            </span>
          </div>
          <CashChart xs={xs} horizon={horizon} />
        </div>

        <div className="cb-card">
          <div className="cb-card-h">
            <span>
              <b>Loss bridge</b>
              <small>From gross loss to what the owner keeps</small>
            </span>
          </div>
          <Waterfall
            steps={[
              { label: 'Lost rent', v: t.revenue, kind: 'add' },
              { label: 'Repairs', v: t.repairs, kind: 'add' },
              { label: 'Property claim', v: -t.propClaim, kind: 'sub' },
              { label: 'Loss-of-rents claim', v: -t.rentClaim, kind: 'sub' },
              { label: 'Retained', v: t.retained, kind: 'total' },
            ]}
          />
        </div>
      </div>

      <div className="cb-card cb-alloc">
        <div className="cb-card-h">
          <span>
            <b>Retained loss by building</b>
            <small>Share of portfolio net exposure, {label}</small>
          </span>
          <span className="cb-tag">{fmtUsd(allRetained)}</span>
        </div>
        <div className="cb-alloc-bar" role="img" aria-label="Retained loss share by building">
          {byRetained.map((f, i) =>
            f.retained > 0 ? <i key={f.x.prop.buildingId} style={{ flexGrow: f.retained, background: SEG[i % SEG.length] }} className={f.x === cur ? 'on' : ''} /> : null,
          )}
        </div>
        <div className="cb-alloc-key">
          {byRetained.map((f, i) => (
            <button key={f.x.prop.buildingId} className={f.x === cur ? 'on' : ''} onClick={() => onSelect(f.x.prop.buildingId)}>
              <i style={{ background: SEG[i % SEG.length] }} />
              <span>{f.x.name}</span>
              <b>{allRetained ? Math.round((f.retained / allRetained) * 100) : 0}%</b>
              <small>{fmtUsd(f.retained)}</small>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function Kpi({ label, tag, value, unit, sub, tone, meter }: { label: string; tag: string; value: string; unit?: string; sub: string; tone?: 'good' | 'bad'; meter?: number }) {
  return (
    <div className="cb-kpi">
      <div className="cb-kpi-h">
        <span>{label}</span>
        <span className="cb-tag">{tag}</span>
      </div>
      <b className={tone ?? ''}>
        {value}
        {unit && <small>{unit}</small>}
      </b>
      <span className="cb-kpi-sub">{sub}</span>
      {meter !== undefined && (
        <span className="cb-kpi-meter" aria-hidden="true">
          <i style={{ left: `${meter * 100}%` }} />
        </span>
      )}
    </div>
  );
}

function CashChart({ xs, horizon }: { xs: BuildingImpact[]; horizon: number }) {
  const W = 640;
  const H = 210;
  const L = 8;
  const R = 70;
  const T = 18;
  const B = 26;
  const N = 48;
  const pts = Array.from({ length: N + 1 }, (_, i) => {
    const h = (i / N) * horizon;
    return { h, ...curveAt(xs, h) };
  });
  const max = Math.max(1, ...pts.map((p) => p.gross)) * 1.12;
  const X = (h: number) => L + (h / horizon) * (W - L - R);
  const Y = (v: number) => T + (1 - v / max) * (H - T - B);
  const line = (k: 'gross' | 'retained') => pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.h).toFixed(1)} ${Y(p[k]).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1]!;
  const wait = BI_WAIT_H < horizon ? X(BI_WAIT_H) : null;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * horizon);
  return (
    <svg className="cb-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Cumulative loss reaches ${fmtUsd(last.gross)} gross and ${fmtUsd(last.retained)} retained by ${horizon} hours`}>
      <defs>
        <linearGradient id="cb-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#b6a6ff" stopOpacity="0.32" />
          <stop offset="1" stopColor="#b6a6ff" stopOpacity="0" />
        </linearGradient>
        <filter id="cb-glow" x="-10%" y="-30%" width="120%" height="160%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={L} x2={W - R} y1={T + f * (H - T - B)} y2={T + f * (H - T - B)} className="cb-grid" />
      ))}
      <line x1={L} x2={W - R} y1={H - B} y2={H - B} className="cb-base" />
      {wait !== null && (
        <g>
          <rect x={wait} y={T} width={W - R - wait} height={H - T - B} className="cb-cover" />
          <line x1={wait} x2={wait} y1={T} y2={H - B} className="cb-wait" />
          <text x={wait + 6} y={T + 12} className="cb-ax">
            Rent cover starts · {BI_WAIT_H}h
          </text>
        </g>
      )}
      <path d={`${line('gross')} L${X(horizon)} ${H - B} L${X(0)} ${H - B}Z`} fill="url(#cb-area)" />
      <path d={line('gross')} className="cb-l-gross" filter="url(#cb-glow)" />
      <path d={line('retained')} className="cb-l-ret" />
      <circle cx={X(horizon)} cy={Y(last.gross)} r={5} className="cb-dot" />
      <circle cx={X(horizon)} cy={Y(last.retained)} r={4} className="cb-dot w" />
      <text x={X(horizon) + 10} y={Y(last.gross) + 4} className="cb-val">
        {fmtUsd(last.gross)}
      </text>
      <text x={X(horizon) + 10} y={Y(last.retained) + (Math.abs(Y(last.retained) - Y(last.gross)) < 14 ? 16 : 4)} className="cb-val w">
        {fmtUsd(last.retained)}
      </text>
      {ticks.map((h) => (
        <text key={h} x={X(h)} y={H - 8} className="cb-ax" textAnchor={h === 0 ? 'start' : h === horizon ? 'end' : 'middle'}>
          {h === 0 ? 'Now' : h % 24 === 0 && h >= 48 ? `${h / 24}d` : `${Math.round(h)}h`}
        </text>
      ))}
    </svg>
  );
}

function Waterfall({ steps }: { steps: { label: string; v: number; kind: 'add' | 'sub' | 'total' }[] }) {
  const max = Math.max(1, steps.filter((s) => s.kind === 'add').reduce((m, s) => m + s.v, 0));
  let run = 0;
  return (
    <ul className="cb-wf">
      {steps.map((s) => {
        const start = s.kind === 'total' ? 0 : s.kind === 'add' ? run : run + s.v;
        const width = Math.abs(s.v);
        if (s.kind !== 'total') run += s.v;
        return (
          <li key={s.label}>
            <span className="cb-wf-l">{s.label}</span>
            <span className="cb-wf-track">
              <i className={s.kind} style={{ left: `${(start / max) * 100}%`, width: `${Math.max(0.6, (width / max) * 100)}%` }} />
            </span>
            <b className={s.kind}>
              {s.kind === 'sub' && s.v !== 0 ? '−' : ''}
              {fmtUsd(Math.abs(s.v))}
            </b>
          </li>
        );
      })}
    </ul>
  );
}
