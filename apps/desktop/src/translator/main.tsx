import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { TranslatorOverlay } from './TranslatorOverlay';
import './translator.css';
import { useSettingsStore } from '../stores/settings';

useSettingsStore.getState().load();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TranslatorOverlay />
  </StrictMode>,
);
