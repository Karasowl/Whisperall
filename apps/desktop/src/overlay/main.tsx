import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Widget } from './Widget';
import './widget.css';
import { useSettingsStore } from '../stores/settings';

useSettingsStore.getState().load();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Widget />
  </StrictMode>,
);
