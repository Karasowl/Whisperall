'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
    type LucideIcon,
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
    ChevronDown,
    Wand2,
    AudioWaveform,
    Globe,
    Volume2,
    Music,
    Radio,
    Lock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getHotkeys } from '@/lib/api';
import { usePlan } from '@/components/PlanProvider';
import { useDevMode } from '@/components/DevModeProvider';
import { useToast } from '@/components/Toast';
import { DevDiagnostics } from './DevDiagnostics';

type SidebarItem = {
    href: string;
    label: string;
    icon: LucideIcon;
    badge?: 'PRO' | 'BETA';
};

const coreItems: SidebarItem[] = [
    { href: '/dictate', label: 'Dictate', icon: Mic },
    { href: '/reader', label: 'Reader', icon: Headphones },
    { href: '/transcribe', label: 'Transcribe', icon: FileAudio },
];

const toolsItems: SidebarItem[] = [
    { href: '/voices', label: 'Voice Library', icon: Mic },
    { href: '/history', label: 'History', icon: History },
];

const moreToolsItems: SidebarItem[] = [
    { href: '/loopback', label: 'Live Capture', icon: Radio, badge: 'PRO' },
    { href: '/ai-edit', label: 'AI Edit', icon: Sparkles },
    { href: '/translate', label: 'Translate', icon: Languages },
];

const labsItems: SidebarItem[] = [
    { href: '/voice-changer', label: 'Voice Changer', icon: Wand2, badge: 'PRO' },
    { href: '/voice-isolator', label: 'Voice Isolator', icon: AudioWaveform, badge: 'PRO' },
    { href: '/dubbing', label: 'Auto Dubbing', icon: Globe, badge: 'PRO' },
    { href: '/music', label: 'Music', icon: Music, badge: 'PRO' },
    { href: '/sfx', label: 'Sound Effects', icon: Volume2, badge: 'PRO' },
];

export function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const { hasPro } = usePlan();
    const { devMode: devModeEnabled } = useDevMode();
    const toast = useToast();
    const [collapsed, setCollapsed] = useState(true);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [moreToolsOpen, setMoreToolsOpen] = useState(false);
    const [labsOpen, setLabsOpen] = useState(false);
    const moreToolsRef = useRef<HTMLDivElement | null>(null);
    const labsRef = useRef<HTMLDivElement | null>(null);
    const showAdvancedNav = devModeEnabled;
    const visibleToolsItems = showAdvancedNav
        ? toolsItems
        : toolsItems.filter((item) => item.href === '/history');

    const goToUpgrade = (featureLabel?: string) => {
        toast.info('Upgrade required', `${featureLabel ?? 'This feature'} is available in Pro.`);
        const params = new URLSearchParams();
        params.set('tab', 'plan');
        params.set('upgrade', 'pro');
        if (featureLabel) params.set('feature', featureLabel);
        router.push(`/settings?${params.toString()}`);
    };

    // Persist collapsed state and sync with CSS variable
    useEffect(() => {
        const stored = localStorage.getItem('sidebar-collapsed');
        if (stored !== null) {
            setCollapsed(stored === 'true');
        } else {
            setCollapsed(true);
            localStorage.setItem('sidebar-collapsed', 'true');
        }
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
            // "Home" is dictation-first now.
            if (action === 'open-tts') router.push('/dictate');
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
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (moreToolsOpen && !moreToolsRef.current?.contains(target)) {
                setMoreToolsOpen(false);
            }
            if (labsOpen && !labsRef.current?.contains(target)) {
                setLabsOpen(false);
            }
        };
        window.addEventListener('mousedown', handleClickOutside);
        return () => window.removeEventListener('mousedown', handleClickOutside);
    }, [moreToolsOpen, labsOpen]);

    useEffect(() => {
        setMoreToolsOpen(false);
        setLabsOpen(false);
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
            <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-background/90 border-b border-surface-3/60 flex items-center justify-between px-4 z-50">
                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => setMobileMenuOpen(true)} 
                        className="p-2 text-foreground rounded-lg hover:bg-surface-2 transition-colors
                                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
                        aria-label="Open navigation menu"
                        aria-expanded={mobileMenuOpen}
                        aria-controls="mobile-sidebar"
                    >
                        <Menu className="w-6 h-6" aria-hidden="true" />
                    </button>
                    <span className="text-lg font-semibold text-foreground">Whisperall</span>
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
                id="mobile-sidebar"
                role="navigation"
                aria-label="Main navigation"
                className={cn(
                "fixed inset-y-0 left-0 z-50 bg-background/80 backdrop-blur-md border-r border-surface-3/60 transition-all duration-300 ease-spring overflow-x-hidden",
                    // Mobile: slide in/out
                    mobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
                    // Base width
                    "w-64",
                    // Desktop collapsed state
                    collapsed && "lg:w-20"
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
                                <div className="w-9 h-9 shrink-0 rounded-xl bg-accent-primary/10 border border-accent-primary/30 flex items-center justify-center">
                                    <div className="w-3 h-3 rounded-full bg-accent-primary" />
                                </div>
                                <span className="text-base font-semibold text-foreground truncate">Whisperall</span>
                            </Link>
                        )}
                        {collapsed && (
                            <div className="w-9 h-9 shrink-0 rounded-xl bg-accent-primary/10 border border-accent-primary/30 flex items-center justify-center">
                                <div className="w-3 h-3 rounded-full bg-accent-primary" />
                            </div>
                        )}

                        {/* Collapse Toggle (Desktop only) */}
                        <button
                            onClick={toggleCollapsed}
                            className="hidden lg:flex p-1.5 rounded-lg hover:bg-surface-2 text-foreground-muted hover:text-foreground transition-colors
                                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
                            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                            aria-expanded={!collapsed}
                        >
                            {collapsed ? <ChevronRight className="w-4 h-4" aria-hidden="true" /> : <ChevronLeft className="w-4 h-4" aria-hidden="true" />}
                        </button>

                        {/* Close Button (Mobile only) */}
                        <button
                            onClick={() => setMobileMenuOpen(false)}
                            className="lg:hidden p-2 text-foreground rounded-lg hover:bg-surface-2 transition-colors
                                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
                            aria-label="Close navigation menu"
                        >
                            <X className="w-5 h-5" aria-hidden="true" />
                        </button>
                    </div>

                    {/* Navigation Items */}
                    <div className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-2 space-y-1 custom-scrollbar">
                        {!collapsed && (
                            <div className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-foreground-muted/70 uppercase">
                                Core
                            </div>
                        )}
                        {coreItems.map(({ href, label, icon: Icon }) => {
                            const isActive = pathname === href;
                            return (
                                <Link
                                    key={href}
                                    href={href}
                                    prefetch={false}
                                    className={cn(
                                        "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group relative",
                                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-inset",
                                        isActive
                                            ? "bg-accent-primary/10 text-accent-primary font-medium"
                                            : "text-foreground-secondary hover:text-foreground hover:bg-surface-2",
                                        collapsed && "justify-center px-2"
                                    )}
                                    title={collapsed ? label : undefined}
                                    aria-current={isActive ? "page" : undefined}
                                >
                                    <Icon className={cn("w-5 h-5 shrink-0", isActive && "text-accent-primary")} aria-hidden="true" />
                                    {!collapsed && <span className="truncate text-sm">{label}</span>}

                                    {collapsed && (
                                        <div className="absolute left-full ml-2 px-2 py-1 bg-surface-base border border-glass-border rounded-md text-xs text-foreground opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 whitespace-nowrap">
                                            {label}
                                        </div>
                                    )}
                                </Link>
                            );
                        })}

                        {!collapsed && (
                            <div className="mt-4 px-3 pb-1 text-[11px] font-semibold tracking-wider text-foreground-muted/70 uppercase">
                                Tools
                            </div>
                        )}
                        {visibleToolsItems.map(({ href, label, icon: Icon }) => {
                            const isActive = pathname === href;
                            return (
                                <Link
                                    key={href}
                                    href={href}
                                    prefetch={false}
                                    className={cn(
                                        "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group relative",
                                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-inset",
                                        isActive
                                            ? "bg-accent-primary/10 text-accent-primary font-medium"
                                            : "text-foreground-secondary hover:text-foreground hover:bg-surface-2",
                                        collapsed && "justify-center px-2"
                                    )}
                                    title={collapsed ? label : undefined}
                                    aria-current={isActive ? "page" : undefined}
                                >
                                    <Icon className={cn("w-5 h-5 shrink-0", isActive && "text-accent-primary")} aria-hidden="true" />
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

                    {showAdvancedNav && (
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
                                <div className="absolute left-0 bottom-full mb-2 w-full rounded-xl border border-glass-border bg-surface-base shadow-lg space-y-1 p-2 z-20">
                                    {moreToolsItems.map(({ href, label, icon: Icon, badge }) => {
                                        const locked = badge === 'PRO' && !hasPro;
                                        return (
                                            <Link
                                                key={href}
                                                href={href}
                                                prefetch={false}
                                                className={cn(
                                                    "flex items-center gap-2 px-3 py-2 rounded-lg text-sm",
                                                    locked
                                                        ? "text-foreground-muted hover:bg-amber-500/10"
                                                        : "text-foreground hover:bg-surface-2"
                                                )}
                                                onClick={(e) => {
                                                    if (locked) {
                                                        e.preventDefault();
                                                        setMoreToolsOpen(false);
                                                        goToUpgrade(label);
                                                        return;
                                                    }
                                                    setMoreToolsOpen(false);
                                                }}
                                                title={locked ? "Pro feature (upgrade to unlock)" : undefined}
                                            >
                                                <Icon className="w-4 h-4" />
                                                <span>{label}</span>
                                                {(badge || locked) && (
                                                    <div className="ml-auto flex items-center gap-2">
                                                        {badge && (
                                                            <span
                                                                className={cn(
                                                                    "px-1.5 py-0.5 text-[10px] font-semibold rounded-full",
                                                                    locked
                                                                        ? "bg-amber-500/10 text-amber-200/80 border border-amber-500/15"
                                                                        : "bg-amber-500/15 text-amber-300"
                                                                )}
                                                            >
                                                                {badge}
                                                            </span>
                                                        )}
                                                        {locked && (
                                                            <Lock className="w-3.5 h-3.5 text-amber-300" aria-hidden="true" />
                                                        )}
                                                    </div>
                                                )}
                                            </Link>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                    )}

                    {showAdvancedNav && (
                    <div className="px-2 pt-2">
                        <div ref={labsRef} className="relative">
                            <button
                                onClick={() => setLabsOpen((prev) => !prev)}
                                className={cn(
                                    "w-full px-3 py-2.5 rounded-xl flex items-center gap-3 transition-all group relative",
                                    collapsed
                                        ? "justify-center"
                                        : "justify-between",
                                    labsOpen ? "bg-surface-2 text-foreground" : "text-foreground-secondary hover:text-foreground hover:bg-surface-2"
                                )}
                                title="Labs"
                            >
                                <Sparkles className="w-5 h-5 shrink-0" />
                                {!collapsed && (
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="truncate text-sm">Labs</span>
                                        <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-white/10 text-foreground-muted">
                                            Beta
                                        </span>
                                    </div>
                                )}
                                {!collapsed && (
                                    <ChevronDown
                                        className={cn(
                                            "w-4 h-4 transition-transform",
                                            labsOpen ? "rotate-180" : ""
                                        )}
                                    />
                                )}
                            </button>

                            {labsOpen && (
                                <div className="absolute left-0 bottom-full mb-2 w-full rounded-xl border border-glass-border bg-surface-base shadow-lg space-y-1 p-2 z-20">
                                    {labsItems.map(({ href, label, icon: Icon, badge }) => {
                                        const locked = badge === 'PRO' && !hasPro;
                                        return (
                                            <Link
                                                key={href}
                                                href={href}
                                                prefetch={false}
                                                className={cn(
                                                    "flex items-center gap-2 px-3 py-2 rounded-lg text-sm",
                                                    locked
                                                        ? "text-foreground-muted hover:bg-amber-500/10"
                                                        : "text-foreground hover:bg-surface-2"
                                                )}
                                                onClick={(e) => {
                                                    if (locked) {
                                                        e.preventDefault();
                                                        setLabsOpen(false);
                                                        goToUpgrade(label);
                                                        return;
                                                    }
                                                    setLabsOpen(false);
                                                }}
                                                title={locked ? "Pro feature (upgrade to unlock)" : undefined}
                                            >
                                                <Icon className="w-4 h-4" />
                                                <span>{label}</span>
                                                {(badge || locked) && (
                                                    <div className="ml-auto flex items-center gap-2">
                                                        {badge && (
                                                            <span
                                                                className={cn(
                                                                    "px-1.5 py-0.5 text-[10px] font-semibold rounded-full",
                                                                    locked
                                                                        ? "bg-amber-500/10 text-amber-200/80 border border-amber-500/15"
                                                                        : "bg-amber-500/15 text-amber-300"
                                                                )}
                                                            >
                                                                {badge}
                                                            </span>
                                                        )}
                                                        {locked && (
                                                            <Lock className="w-3.5 h-3.5 text-amber-300" aria-hidden="true" />
                                                        )}
                                                    </div>
                                                )}
                                            </Link>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                    )}

                    {/* Footer / Secondary Items */}
                    <div className="p-2 border-t border-glass-border space-y-1">
                        {devModeEnabled && (
                            <Link
                                href="/models"
                                prefetch={false}
                                className={cn(
                                    "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group relative",
                                    pathname === "/models"
                                        ? "bg-accent-primary/10 text-accent-primary font-medium"
                                        : "text-foreground-secondary hover:text-foreground hover:bg-surface-2",
                                    collapsed && "justify-center px-2"
                                )}
                                title={collapsed ? "Resources" : undefined}
                            >
                                <HardDrive className="w-5 h-5 shrink-0" />
                                {!collapsed && <span className="truncate text-sm">Resources</span>}
                                {collapsed && (
                                    <div className="absolute left-full ml-2 px-2 py-1 bg-surface-base border border-glass-border rounded-md text-xs text-foreground opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 whitespace-nowrap">
                                        Resources
                                    </div>
                                )}
                            </Link>
                        )}

                        <Link
                            href="/settings"
                            prefetch={false}
                            className={cn(
                                "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group relative",
                                pathname === "/settings"
                                    ? "bg-accent-primary/10 text-accent-primary font-medium"
                                    : "text-foreground-secondary hover:text-foreground hover:bg-surface-2",
                                collapsed && "justify-center px-2"
                            )}
                            title={collapsed ? "Settings" : undefined}
                        >
                            <Settings className="w-5 h-5 shrink-0" />
                            {!collapsed && <span className="truncate text-sm">Settings</span>}
                            {collapsed && (
                                <div className="absolute left-full ml-2 px-2 py-1 bg-surface-base border border-glass-border rounded-md text-xs text-foreground opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 whitespace-nowrap">
                                    Settings
                                </div>
                            )}
                        </Link>

                        {/* Dev Diagnostics - only shown when DEV_MODE=true */}
                        <DevDiagnostics collapsed={collapsed} />
                    </div>
                </div>
            </aside>
        </>
    );
}
