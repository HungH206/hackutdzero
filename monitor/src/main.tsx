import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { HeadcountProvider } from './data/HeadcountProvider';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HeadcountProvider>
      <App />
    </HeadcountProvider>
  </StrictMode>,
);
