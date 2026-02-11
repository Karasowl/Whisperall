'use client';

import { useState } from 'react';
import { FAQ_ITEMS } from '@/lib/constants';

export function FAQ() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <section className="max-w-3xl mx-auto">
      <h3 className="text-2xl font-bold text-text text-center mb-8">Frequently Asked Questions</h3>
      <div className="space-y-3">
        {FAQ_ITEMS.map(({ q, a }, i) => {
          const isOpen = openIdx === i;
          return (
            <div key={i} className="border border-edge rounded-xl overflow-hidden">
              <button
                data-testid={`faq-${i}`}
                onClick={() => setOpenIdx(isOpen ? null : i)}
                className="w-full flex items-center justify-between px-5 py-4 text-left text-sm font-medium text-text hover:bg-surface-alt transition-colors"
              >
                {q}
                <span className={`material-symbols-outlined text-muted text-[20px] transition-transform ${isOpen ? 'rotate-180' : ''}`}>expand_more</span>
              </button>
              {isOpen && (
                <div className="px-5 pb-4 text-sm text-text-secondary leading-relaxed">{a}</div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
