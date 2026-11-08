import { useState } from 'react';
import { Icon } from '../Icon';
import type { Concern } from './concerns';

export function Analysis({ concerns, onSelect, onClose }: { concerns: Concern[]; onSelect(id: number): void; onClose(): void }) {
  const [all, setAll] = useState(false);
  const shown = all ? concerns : concerns.slice(0, 1);
  return (
    <section className="py-analysis" aria-label="HPI analysis">
      <div className="py-an-h">
        <span>
          <b>HPI</b> ANALYSIS
        </span>
        <span className="py-an-ctl">
          {concerns.length > 1 && (
            <button className="py-pill" onClick={() => setAll((a) => !a)} aria-expanded={all}>
              <Icon name="chevronDown" size={13} className={all ? 'flip' : undefined} /> {all ? 'Less' : `+${concerns.length - 1}`}
            </button>
          )}
          <button className="py-x" onClick={onClose} aria-label="Close analysis">
            <Icon name="x" size={14} />
          </button>
        </span>
      </div>
      <div className="py-an-list">
        {shown.map((k) => (
          <button key={k.key} className={`py-concern ${k.tone}`} onClick={() => k.target !== undefined && onSelect(k.target)}>
            <span className="py-c-top">
              <span className="py-c-title">
                <i>[</i>
                {k.title}
              </span>
              <span className="py-c-ref">
                {k.ref} <Icon name="chevronRight" size={13} />
              </span>
            </span>
            <span className="py-c-text">{k.text}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
