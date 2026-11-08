import { useState } from 'react';
import type { View } from '../data/derive';
import { useHeadcount } from '../data/HeadcountProvider';
import type { Actions } from '../data/types';
import { Icon, type IconName } from './Icon';

/**
 * On a real server these controls are operator-only, and every browser starts read-only.
 * `npm run promote` promotes whoever is connected, so nobody has to copy an identity; the
 * copy button is here for the case where the promoting terminal is on another machine.
 */
function IdentityNote({ identity }: { identity: string }) {
  const [copied, setCopied] = useState<'identity' | 'command' | null>(null);
  const copy = async (what: 'identity' | 'command', text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null); // Clipboard blocked (not on localhost or https): the text below is selectable.
    }
  };
  return (
    <div className="ident-note">
      <p className="fine">
        Controls are for dispatchers only. To make this browser a dispatcher, run <code>npm run promote</code> in <code>monitor/</code> and reload. It promotes whoever is connected, so there is nothing
        to copy.
      </p>
      <p className="fine">
        This browser is <code className="ident-code">{identity}</code>
      </p>
      <div className="ident-actions">
        <button className="btn" onClick={() => void copy('identity', identity)}>
          <Icon name="user" size={13} /> {copied === 'identity' ? 'Copied' : 'Copy identity'}
        </button>
        <button className="btn" onClick={() => void copy('command', `npm run promote -- ${identity}`)}>
          <Icon name="plus" size={13} /> {copied === 'command' ? 'Copied' : 'Copy command'}
        </button>
      </div>
    </div>
  );
}

// Every button calls a sim_* reducer on the module. Nothing is faked locally.
export function DemoPanel({ view, actions, onError }: { view: View; actions: Actions; onError(msg: string): void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { connection } = useHeadcount();
  const alvarez = view.households.find((h) => h.name === 'Mrs. Alvarez');
  const chen = view.households.find((h) => h.name === 'Mr. Chen');
  const elm = [...view.building.values()].find((b) => b.name.startsWith('Elm'));
  const run = async (fn: () => Promise<void> | undefined) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const triggers: { icon: IconName; title: string; sub: string; fn: () => Promise<void> | undefined }[] = [
    { icon: 'quake', title: 'Earthquake', sub: 'Near Alder Court', fn: () => alvarez && actions.simQuake(alvarez.x + 40, alvarez.y + 30, 1) },
    { icon: 'zap', title: 'Power loss', sub: 'West side', fn: () => alvarez && actions.simPowerLoss(alvarez.x, alvarez.y, 420) },
    { icon: 'flame', title: 'Fire', sub: 'Cypress Flats 3B', fn: () => chen && actions.simFire(chen.id) },
    { icon: 'wifiOff', title: 'Comms outage', sub: 'Elm Gardens', fn: () => elm && actions.simCommsOutage(elm.x + elm.w / 2, elm.y + elm.h / 2, 120) },
  ];
  return (
    <div className="demo-wrap">
      <button className={`demo-btn${open ? ' on' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Icon name="plus" size={15} /> New Simulation
      </button>
      {open && (
        <div className="demo-pop glass" role="dialog" aria-label="Demo controls">
          <div className="eyebrow">Simulation controls</div>
          <p className="fine">SIMULATION. Triggers simulated sensor events on the server. All households are synthetic, and no real emergency service is contacted.</p>
          {connection.identity && <IdentityNote identity={connection.identity} />}
          <div className="trig-grid">
            {triggers.map((t) => (
              <button key={t.title} className="trig" disabled={busy} onClick={() => run(t.fn)}>
                <Icon name={t.icon} size={20} />
                <b>{t.title}</b>
                <small>{t.sub}</small>
              </button>
            ))}
          </div>
          <div className="eyebrow">Time</div>
          <div className="ff-row">
            {[1, 5, 15].map((m) => (
              <button key={m} className="btn" disabled={busy} onClick={() => run(() => actions.simFastForward(m))}>
                <Icon name="forward" size={14} /> +{m} min
              </button>
            ))}
            <button className="btn danger" disabled={busy} onClick={() => run(() => actions.simReset())}>
              <Icon name="reset" size={14} /> Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
