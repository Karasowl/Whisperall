'use client';

import { useEffect, useRef, useState } from 'react';
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
    Menu,
    X,
    ChevronRight,
    ChevronLeft,
    ChevronDown
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getHotkeys } from '@/lib/api';

const navItems = [
    { href: '/', label: 'Text to Speech', icon: MessageSquare, shortLabel: 'TTS' },
    { href: '/reader', label: 'Reader', icon: Headphones, shortLabel: 'Reader' },
    { href: '/dictate', label: 'Speech to Text', icon: Mic, shortLabel: 'STT' },
    { href: '/transcribe', label: 'Transcribe', icon: FileAudio, shortLabel: 'Transcribe' },
    { href: '/voices', label: 'Voice Library', icon: Mic, shortLabel: 'Voices' },
    { href: '/history', label: 'History', icon: History, shortLabel: 'History' },
];

const moreToolsItems = [
    { href: '/ai-edit', label: 'AI Edit', icon: Sparkles },
    { href: '/translate', label: 'Translate', icon: Languages },
    { href: '/audiobook', label: 'Audiobook', icon: BookOpen },
];

const secondaryItems = [
    { href: '/models', label: 'Models', icon: HardDrive },
    { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const [collapsed, setCollapsed] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [moreToolsOpen, setMoreToolsOpen] = useState(false);
    const moreToolsRef = useRef<HTMLDivElement | null>(null);

    // Persist collapsed state and sync with CSS variable
    useEffect(() => {
        const stored = localStorage.getItem('sidebar-collapsed');
        if (stored) setCollapsed(stored === 'true');
    }, []);

    // Sync collapsed state to CSS variable for layout coordination
    useEffect(() => {
        document.documentElement.style.setProperty('--sidebar-width', collapsed ? '5rem' : '16rem');
    }, [collapsed]);

    const toggleCollapsed = () => {
        const newState = !collapsed;
        setCollapsed(newState);
        localStorage.setItem('sidebar-collapsed', String(newState));
    };

    // Close mobile menu on navigation
    useEffect(() => {
        setMobileMenuOpen(false);
    }, [pathname]);

    // Handle hotkeys (copied from original Navigation)
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
        const handleClickOutside = (event: MouseEvent) => {
            if (!moreToolsOpen) return;
            if (moreToolsRef.current?.contains(event.target as Node)) return;
            setMoreToolsOpen(false);
        };
        window.addEventListener('mousedown', handleClickOutside);
        return () => window.removeEventListener('mousedown', handleClickOutside);
    }, [moreToolsOpen]);

    useEffect(() => {
        setMoreToolsOpen(false);
    }, [pathname]);

    useEffect(() => {
        if (!window.electronAPI?.updateHotkeys) return;
        getHotkeys()
            .then((hotkeys) => {
                window.electronAPI?.updateHotkeys(hotkeys);
            })
            .catch(() => { });
    }, []);

    return (
        <>
            {/* Mobile Toggle & Top Bar (Visible only on small screens) */}
            <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-background/80 backdrop-blur-md border-b border-glass-border flex items-center justify-between px-4 z-50">
                <div className="flex items-center gap-3">
                    <button onClick={() => setMobileMenuOpen(true)} className="p-2 text-foreground">
                        <Menu className="w-6 h-6" />
                    </button>
                    <span className="text-lg font-bold text-gradient-accent">Whisperall</span>
                </div>
            </div>

            {/* Backdrop for Mobile */}
            {mobileMenuOpen && (
                <div
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 lg:hidden"
                    onClick={() => setMobileMenuOpen(false)}
                />
            )}

            {/* Sidebar Container */}
            <aside
                className={cn(
                    "fixed inset-y-0 left-0 z-50 bg-glass-surface backdrop-blur-lg border-r border-glass-border transition-all duration-300 ease-spring",
                    // Mobile: slide in/out
                    mobileMenuOpen ? "translate-x-0 w-64" : "-translate-x-full lg:translate-x-0 w-0 lg:w-64",
                    // Desktop collapsed state
                    !mobileMenuOpen && collapsed && "lg:w-20"
                )}
            >
                <div className="flex flex-col h-full">
                    {/* Header / Logo */}
                    <div className={cn(
                        "h-16 flex items-center px-4 border-b border-glass-border shrink-0",
                        collapsed ? "justify-center" : "justify-between"
                    )}>
                        {!collapsed && (
                            <Link href="/" prefetch={false} className="flex items-center gap-3 group overflow-hidden">
                                <div className="w-8 h-8 shrink-0 bg-gradient-to-br from-accent-primary via-teal-400 to-accent-secondary rounded-lg shadow-lg shadow-accent-primary/20" />
                                <span className="text-lg font-bold text-gradient-accent truncate">Whisperall</span>
                            </Link>
                        )}
                        {collapsed && (
                            <div className="w-8 h-8 shrink-0 bg-gradient-to-br from-accent-primary via-teal-400 to-accent-secondary rounded-lg shadow-lg shadow-accent-primary/20" />
                        )}

                        {/* Collapse Toggle (Desktop only) */}
                        <button
                            onClick={toggleCollapsed}
                            className="hidden lg:flex p-1.5 rounded-lg hover:bg-surface-2 text-foreground-muted hover:text-foreground transition-colors"
                        >
                            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                        </button>

                        {/* Close Button (Mobile only) */}
                        <button
                            onClick={() => setMobileMenuOpen(false)}
                            className="lg:hidden p-2 text-foreground"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Navigation Items */}
                    <div className="flex-1 overflow-y-auto py-4 px-2 space-y-1 custom-scrollbar">
                        {navItems.map(({ href, label, icon: Icon, shortLabel }) => {
                            const isActive = pathname === href;
                            return (
                                <Link
                                    key={href}
                                    href={href}
                                    prefetch={false}
                                    className={cn(
                                        "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group relative",
                                        isActive
                                            ? "bg-accent-primary/10 text-accent-primary font-medium"
                                            : "text-foreground-secondary hover:text-foreground hover:bg-surface-2",
                                        collapsed && "justify-center px-2"
                                    )}
                                    title={collapsed ? label : undefined}
                                >
                                    <Icon className={cn("w-5 h-5 shrink-0", isActive && "text-accent-primary")} />
                                    {!collapsed && <span className="truncate text-sm">{label}</span>}

                                    {/* Tooltip for collapsed state */}
                                    {collapsed && (
                                        <div className="absolute left-full ml-2 px-2 py-1 bg-surface-base border border-glass-border rounded-md text-xs text-foreground opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 whitespace-nowrap">
                                            {label}
                                        </div>
                                    )}
                                </Link>
                            );
                        })}
                    </div>

                    <div className="px-2 pt-3">
                        <div ref={moreToolsRef} className="relative">
                            <button
                                onClick={() => setMoreToolsOpen((prev) => !prev)}
                                className={cn(
                                    "w-full px-3 py-2.5 rounded-xl flex items-center gap-3 transition-all group relative",
                                    collapsed
                                        ? "justify-center"
                                        : "justify-between",
                                    moreToolsOpen ? "bg-surface-2 text-foreground" : "text-foreground-secondary hover:text-foreground hover:bg-surface-2"
                                )}
                                title="More tools"
                            >
                                <Sparkles className="w-5 h-5 shrink-0" />
                                {!collapsed && (
                                    <span className="truncate text-sm">More Tools</span>
                                )}
                                {!collapsed && (
                                    <ChevronDown
                                        className={cn(
                                            "w-4 h-4 transition-transform",
                                            moreToolsOpen ? "rotate-180" : ""
                                        )}
                                    />
                                )}
                            </button>

                            {moreToolsOpen && (
                                <div className="absolute left-0 top-full mt-2 w-full rounded-xl border border-glass-border bg-surface-base shadow-lg space-y-1 p-2 z-20">
                                    {moreToolsItems.map(({ href, label, icon: Icon }) => (
                                        <Link
                                            key={href}
                                            href={href}
                                            prefetch={false}
                                            className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface-2 text-sm text-foreground"
                                            onClick={() => setMoreToolsOpen(false)}
                                        >
                                            <Icon className="w-4 h-4" />
                                            <span>{label}</span>
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Footer / Secondary Items */}
                    <div className="p-2 border-t border-glass-border space-y-1">
                        {secondaryItems.map(({ href, label, icon: Icon }) => {
                            const isActive = pathname === href;
                            return (
                                <Link
                                    key={href}
                                    href={href}
                                    prefetch={false}
                                    className={cn(
                                        "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group relative",
                                        isActive
                                            ? "bg-accent-primary/10 text-accent-primary font-medium"
                                            : "text-foreground-secondary hover:text-foreground hover:bg-surface-2",
                                        collapsed && "justify-center px-2"
                                    )}
                                    title={collapsed ? label : undefined}
                                >
                                    <Icon className="w-5 h-5 shrink-0" />
                                    {!collapsed && <span className="truncate text-sm">{label}</span>}
                                    {collapsed && (
                                        <div className="absolute left-full ml-2 px-2 py-1 bg-surface-base border border-glass-border rounded-md text-xs text-foreground opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 whitespace-nowrap">
                                            {label}
                                        </div>
                                    )}
                                </Link>
                            );
                        })}
                    </div>
                </div>
            </aside>
        </>
    );
}
