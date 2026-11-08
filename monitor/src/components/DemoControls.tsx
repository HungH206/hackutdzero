import { useState } from 'react';
import type { View } from '../data/derive';
import type { Actions } from '../data/types';

// Demo-only controls. Every button calls a sim_* reducer on the module; the
// dashboard never fakes state locally.
export function DemoControls({ view, actions, onError }: { view: View; actions: Actions; onError(msg: string): void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const find = (name: string) => view.households.find((h) => h.name === name);
  const alder = view.households.find((h) => h.name === 'Mrs. Alvarez');
  const chen = find('Mr. Chen');
  const elm = [...view.building.values()].find((b) => b.name.startsWith('Elm'));

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button className="demo-fab" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? 'Close demo controls' : 'Demo controls'}
      </button>
      {open && (
        <div className="demo" role="dialog" aria-label="Demo controls">
          <h3>Demo controls (simulation)</h3>
          <p>These trigger simulated sensor events on the server. All households are synthetic.</p>
          <div className="grid">
            <button className="btn" disabled={busy || !alder} onClick={() => run(() => actions.simQuake(alder!.x + 40, alder!.y + 30, 1.0))}>
              ✱ Earthquake near Alder Ct
            </button>
            <button className="btn" disabled={busy || !alder} onClick={() => run(() => actions.simPowerLoss(alder!.x, alder!.y, 420))}>
              ⚡ Power loss (west side)
            </button>
            <button className="btn" disabled={busy || !chen} onClick={() => run(() => actions.simFire(chen!.id))}>
              🔥 Fire in Cypress 3B
            </button>
            <button className="btn" disabled={busy || !elm} onClick={() => run(() => actions.simCommsOutage(elm!.x + elm!.w / 2, elm!.y + elm!.h / 2, 120))}>
              📡 Comms outage (Elm)
            </button>
          </div>
          <div className="btn-row">
            {[1, 5, 15].map((m) => (
              <button key={m} className="btn" disabled={busy} onClick={() => run(() => actions.simFastForward(m))}>
                ⏩ +{m} min
              </button>
            ))}
            <button className="btn crit" disabled={busy} onClick={() => run(() => actions.simReset())}>
              Reset
            </button>
          </div>
        </div>
      )}
    </>
  );
}
