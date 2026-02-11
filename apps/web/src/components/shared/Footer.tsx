import Link from 'next/link';

const COLS = [
  { title: 'Product', links: [
    { label: 'Features', href: '/#features' },
    { label: 'Pricing', href: '/pricing' },
    { label: 'Download', href: '/download' },
  ]},
  { title: 'Company', links: [
    { label: 'About', href: '/#about' },
    { label: 'Blog', href: '#' },
    { label: 'Contact', href: 'mailto:hello@whisperall.com' },
  ]},
  { title: 'Legal', links: [
    { label: 'Privacy', href: '/privacy' },
    { label: 'Terms', href: '/terms' },
  ]},
];

export function Footer() {
  return (
    <footer className="border-t border-edge bg-surface-alt">
      <div className="max-w-7xl mx-auto px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
        {/* Brand */}
        <div className="col-span-2 md:col-span-1">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-[16px]">graphic_eq</span>
            </div>
            <span className="font-bold text-text">WhisperAll</span>
          </div>
          <p className="text-sm text-muted leading-relaxed">Your voice, supercharged. All-in-one voice AI for dictation, transcription, translation, and more.</p>
        </div>

        {/* Link columns */}
        {COLS.map(({ title, links }) => (
          <div key={title}>
            <h4 className="text-xs font-bold uppercase text-muted mb-3 tracking-wider">{title}</h4>
            <ul className="space-y-2">
              {links.map(({ label, href }) => (
                <li key={label}>
                  <Link href={href} className="text-sm text-text-secondary hover:text-text transition-colors">{label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-edge">
        <div className="max-w-7xl mx-auto px-6 py-4 text-center text-xs text-muted">
          &copy; {new Date().getFullYear()} WhisperAll. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
