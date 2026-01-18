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
  FileAudio
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getHotkeys } from '@/lib/api';

const navItems = [
  { href: '/', label: 'TTS', icon: MessageSquare, description: 'Text to Speech' },
  { href: '/reader', label: 'Reader', icon: Headphones, description: 'Real-time Reader' },
  { href: '/dictate', label: 'STT', icon: Mic, description: 'Speech to Text' },
  { href: '/ai-edit', label: 'AI Edit', icon: Sparkles, description: 'AI Text Editing' },
  { href: '/translate', label: 'Translate', icon: Languages, description: 'Translation' },
  { href: '/audiobook', label: 'Audiobook', icon: BookOpen, description: 'Audiobook Creator' },
  { href: '/transcribe', label: 'Transcribe', icon: FileAudio, description: 'Long-form Transcription' },
  { href: '/voices', label: 'Voices', icon: Mic, description: 'Voice Library' },
  { href: '/history', label: 'History', icon: History, description: 'History' },
];

const secondaryItems = [
  { href: '/models', label: 'Models', icon: HardDrive },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Navigation() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!window.electronAPI?.onHotkey) return;

    const unsubscribe = window.electronAPI.onHotkey((action) => {
      window.__lastHotkey = action;
      if (action === 'open-tts') router.push('/');
      if (action === 'dictate-toggle') router.push('/dictate');
      if (action === 'read-clipboard') router.push('/reader');
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
      .catch(() => {});
  }, []);

  return (
    <nav className="nav-glass sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 bg-gradient-to-br from-emerald-400 via-teal-400 to-amber-400 rounded-xl shadow-lg shadow-emerald-400/20 group-hover:shadow-emerald-400/40 transition-shadow" />
            <span className="text-xl font-bold text-gradient">Whisperall</span>
          </Link>

          {/* Main Navigation */}
          <div className="flex items-center gap-1">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
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
                className={cn(
                  'btn-icon btn-ghost',
                  pathname === href && 'bg-glass text-accent-primary'
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
