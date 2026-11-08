import config from '../dashboards.json';

// Each dashboard gets its own localhost port (see scripts/dashboards.mjs).
// All ports forward to one dev server, so every dashboard shows the same live
// data. An explicit ?view= or ?app= in the URL still wins.
export function portView(): string | null {
  const p = Number(window.location.port);
  return config.dashboards.find((d) => d.port === p)?.view ?? null;
}
