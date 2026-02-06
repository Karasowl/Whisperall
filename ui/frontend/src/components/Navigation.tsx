'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  MessageSquare,
  BookOpen,
  Mic,
  HardDrive,
  History,
  Settings,
  Headphones,
  Languages,
  Sparkles,
  FileAudio,
  Music,
  Volume2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getHotkeys } from '@/lib/api';
import { useDevMode } from '@/components/DevModeProvider';

const navItems = [
  { href: '/dictate', label: 'Dictate', icon: Mic, description: 'Dictation' },
  { href: '/reader', label: 'Reader', icon: Headphones, description: 'Read aloud' },
  { href: '/transcribe', label: 'Transcribe', icon: FileAudio, description: 'Long-form transcription' },
  { href: '/voices', label: 'Voices', icon: Mic, description: 'Voice library' },
  { href: '/history', label: 'History', icon: History, description: 'History' },
];

export function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.isElectron;
  const { devMode } = useDevMode();

  const secondaryItems = [
    ...(devMode ? [{ href: '/models', label: 'Resources', icon: HardDrive }] : []),
    { href: '/settings', label: 'Settings', icon: Settings },
  ];

  useEffect(() => {
    if (!window.electronAPI?.onHotkey) return;

    const unsubscribe = window.electronAPI.onHotkey((action) => {
      window.__lastHotkey = action;
      // "Home" is dictation-first now.
      if (action === 'open-tts') router.push('/dictate');
      if (action === 'dictate-toggle') router.push('/dictate');
      if (action === 'read-clipboard') router.push('/reader');
      if (action === 'open-loopback') router.push('/loopback');
      if (action === 'ai-edit') router.push('/ai-edit');
      if (action === 'translate') router.push('/translate');
      if (action === 'open-settings') router.push('/settings');

      window.dispatchEvent(new CustomEvent('hotkey-action', { detail: action }));
    });

    return () => {
      unsubscribe?.();
    };
  }, [router]);

  useEffect(() => {
    if (!window.electronAPI?.updateHotkeys) return;
    getHotkeys()
      .then((hotkeys) => {
        window.electronAPI?.updateHotkeys(hotkeys);
      })
      .catch(() => { });
  }, []);

  return (
    <nav className="nav-glass sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/dictate" prefetch={false} className="flex items-center gap-3 group">
            <div className="w-9 h-9 bg-gradient-to-br from-accent-primary via-teal-400 to-accent-secondary rounded-xl shadow-lg shadow-accent-primary/20 group-hover:shadow-accent-primary/40 transition-shadow" />
            <span className="text-xl font-bold text-gradient-accent">Whisperall</span>
          </Link>

          {/* Main Navigation */}
          <div className="flex items-center gap-1">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                prefetch={false}
                className={cn(
                  'nav-item',
                  pathname === href && 'active'
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden lg:inline">{label}</span>
              </Link>
            ))}
          </div>

          {/* Secondary Navigation */}
          <div className="flex items-center gap-2">
            {secondaryItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                prefetch={false}
                className={cn(
                  'btn-icon btn-ghost',
                  pathname === href && 'bg-surface-1 text-[var(--accent-primary)]'
                )}
                title={label}
              >
                <Icon className="w-5 h-5" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}
