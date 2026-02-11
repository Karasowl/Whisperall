'use client';

import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('whisperall-theme', next ? 'dark' : 'light');
  };

  return (
    <button onClick={toggle} className="p-2 rounded-lg text-muted hover:text-text hover:bg-surface transition-colors" aria-label="Toggle theme">
      <span className="material-symbols-outlined text-[20px]">{dark ? 'light_mode' : 'dark_mode'}</span>
    </button>
  );
}
