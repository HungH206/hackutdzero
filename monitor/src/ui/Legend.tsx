import { useState } from 'react';
import { BAND_COLOR } from './Gauges';
import { Icon } from './Icon';

export function Legend() {
  const [open, setOpen] = useState(false);
  return (
    <div className={`legend glass${open ? '' : ' closed'}`}>
      <button className="legend-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="eyebrow">Legend</span>
        <Icon name="chevronDown" size={14} className={open ? undefined : 'rot'} />
      </button>
      {open && (
        <ul>
          {(
            [
              ['critical', '75-100 critical'],
              ['high', '50-74 high'],
              ['guarded', '25-49 guarded'],
              ['low', '0-24 low'],
            ] as const
          ).map(([b, l]) => (
            <li key={b}>
              <i className="orb-dot" style={{ background: BAND_COLOR[b], boxShadow: `0 0 8px ${BAND_COLOR[b]}` }} />
              {l}
            </li>
          ))}
          <li>
            <i className="orb-dot" style={{ background: 'var(--ok)' }} /> Found OK
          </li>
          <li>
            <i className="orb-dot" style={{ background: 'var(--assisted)' }} /> Assisted
          </li>
          <li>
            <i className="orb-dot hollow" /> Unknown · no sensor
          </li>
          <li>
            <i className="orb-dot dashed" /> Node silent
          </li>
          <li>
            <i className="line route" /> Responder route
          </li>
          <li>
            <i className="line walk" /> Volunteer knock
          </li>
          <li className="fine">Size grows with HPI · #N = rank</li>
        </ul>
      )}
    </div>
  );
}
