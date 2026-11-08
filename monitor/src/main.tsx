import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { CbreApp } from './cbre/CbreApp';
import { AgentApp } from './agent/AgentApp';
import { portView } from './dashboards';
import { HeadcountProvider } from './data/HeadcountProvider';
import '@fontsource-variable/outfit';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/roboto-condensed/400.css';
import '@fontsource/roboto-condensed/600.css';
import './styles.css';
import './py.css';

const isCbre = () => {
  const q = new URLSearchParams(window.location.search);
  return q.get('app') === 'cbre' || (!q.has('view') && !q.has('app') && portView() === 'cbre');
};

const isAgent = () => {
  const q = new URLSearchParams(window.location.search);
  return q.get('app') === 'agent' || (!q.has('view') && !q.has('app') && portView() === 'agent');
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HeadcountProvider>
      {isAgent() ? <AgentApp /> : isCbre() ? <CbreApp /> : <App />}
    </HeadcountProvider>
  </StrictMode>,
);
