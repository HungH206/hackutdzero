// Contract first (theme/SYSTEM.md): tokens, base, kit. Legacy screen CSS follows
// and only reads these tokens.
import './theme/tokens.css';
import './theme/base.css';
import './ui/kit/kit.css';
import '@fontsource-variable/inter';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import './styles.css';
import './py.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { CbreApp } from './cbre/CbreApp';
import { AgentApp } from './agent/AgentApp';
import { portView } from './dashboards';
import { HeadcountProvider } from './data/HeadcountProvider';

const isCbre = () => {
  const q = new URLSearchParams(window.location.search);
  return q.get('app') === 'cbre' || (!q.has('view') && !q.has('app') && portView() === 'cbre');
};

const isAgent = () => {
  const q = new URLSearchParams(window.location.search);
  return q.get('app') === 'agent' || (!q.has('view') && !q.has('app') && portView() === 'agent');
};

// The CBRE view keeps its own dark look and Outfit face; only it loads that font.
if (isCbre()) void import('@fontsource-variable/outfit');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HeadcountProvider>
      {isAgent() ? <AgentApp /> : isCbre() ? <CbreApp /> : <App />}
    </HeadcountProvider>
  </StrictMode>,
);
