'use client';

import { useEffect, useState } from 'react';
import { detectPlatform, PLATFORM_INFO, type Platform } from '@/lib/platform';
import { Button } from '../shared/Button';

const PLATFORMS: Platform[] = ['windows', 'mac', 'linux'];

export function PlatformSelector() {
  const [selected, setSelected] = useState<Platform>('windows');

  useEffect(() => { setSelected(detectPlatform()); }, []);

  const info = PLATFORM_INFO[selected];

  return (
    <div className="max-w-2xl mx-auto">
      {/* Tabs */}
      <div className="flex justify-center gap-2 mb-8">
        {PLATFORMS.map((p) => {
          const active = p === selected;
          return (
            <button key={p} data-testid={`platform-${p}`} onClick={() => setSelected(p)} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${active ? 'bg-primary text-white shadow-lg shadow-primary/25' : 'bg-surface border border-edge text-muted hover:text-text'}`}>
              <span className="material-symbols-outlined text-[18px]">{PLATFORM_INFO[p].icon}</span>
              {PLATFORM_INFO[p].label}
            </button>
          );
        })}
      </div>

      {/* Download CTA */}
      <div className="text-center mb-8">
        <Button size="lg">
          <span className="material-symbols-outlined text-[20px] mr-2">download</span>
          Download for {info.label} ({info.ext})
        </Button>
        <p className="text-xs text-muted mt-3">Free plan included. No credit card required.</p>
      </div>

      {/* Requirements */}
      <div className="bg-surface border border-edge rounded-2xl p-6">
        <h3 className="text-sm font-bold text-text mb-3">System Requirements</h3>
        <ul className="space-y-2">
          {info.requirements.map((r) => (
            <li key={r} className="flex items-start gap-2 text-sm text-text-secondary">
              <span className="material-symbols-outlined text-primary text-[16px] mt-0.5 fill-1">check</span>
              {r}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
