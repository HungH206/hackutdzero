import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { CbreApp } from './cbre/CbreApp';
import { HeadcountProvider } from './data/HeadcountProvider';
import '@fontsource-variable/outfit';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/roboto-condensed/400.css';
import '@fontsource/roboto-condensed/600.css';
import './styles.css';
import './py.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HeadcountProvider>
      {new URLSearchParams(window.location.search).get('app') === 'cbre' ? <CbreApp /> : <App />}
    </HeadcountProvider>
  </StrictMode>,
);
