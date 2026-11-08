// Dev-only gallery at /kit.html. Renders every *.demo.tsx in ui/kit/demos and
// ui/map/demos so each shared component can be checked in isolation. It is not
// part of the production build. ?only=<name> shows a single demo.
import { Component, lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import.meta.glob('./tokens.css', { eager: true });
import.meta.glob(['../ui/kit/*.css', '../ui/map/*.css'], { eager: true });

const demos = import.meta.glob<{ default: ComponentType }>(['../ui/kit/demos/*.demo.tsx', '../ui/map/demos/*.demo.tsx']);

class Guard extends Component<{ name: string; children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: unknown) {
    return { error: String(e) };
  }
  render() {
    return this.state.error ? <pre>{`${this.props.name}: ${this.state.error}`}</pre> : this.props.children;
  }
}

const only = new URLSearchParams(location.search).get('only');
const entries = Object.entries(demos)
  .map(([file, load]) => ({ name: file.split('/').pop()!.replace('.demo.tsx', ''), Demo: lazy(load) }))
  .filter((d) => !only || d.name === only)
  .sort((a, b) => a.name.localeCompare(b.name));

createRoot(document.getElementById('root')!).render(
  <main style={{ padding: 24, display: 'grid', gap: 32 }}>
    {entries.map(({ name, Demo }) => (
      <section key={name} data-demo={name}>
        <h2 className="t-caption" style={{ margin: '0 0 12px' }}>
          {name}
        </h2>
        <Guard name={name}>
          <Suspense fallback={null}>
            <Demo />
          </Suspense>
        </Guard>
      </section>
    ))}
  </main>,
);
