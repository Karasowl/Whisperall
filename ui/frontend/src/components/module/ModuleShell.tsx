'use client';

import { useState, useEffect } from 'react';
import { LucideIcon, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ModuleHeader } from './ModuleHeader';
import { StatusAlert } from './StatusAlert';

/**
 * Module Layout Types:
 * - default: 2-column with settings left (1/3) and main right (2/3) - Voice Changer, Music, Reader
 * - split: 2 equal columns for input/output - AI Edit, Speech to Text
 * - centered: Single centered column - Audiobook Creator, Voice Library
 * - wide: Full width without sidebar - Live Transcription
 */
export type ModuleLayout = 'default' | 'split' | 'centered' | 'wide';

// Legacy layout names for backward compatibility
export type LegacyLayout = 'input-focused' | 'processing' | 'generator';

interface ProgressState {
  value: number;
  status: string;
  details?: string;
}

interface ModuleShellProps {
  // === METADATA ===
  title: string;
  description?: string;
  icon?: LucideIcon;

  // === LAYOUT ===
  layout: ModuleLayout | LegacyLayout;
  settingsPosition?: 'left' | 'right';

  // === SLOTS ===
  /** Actions in the header (execution controls, etc.) */
  headerActions?: React.ReactNode;
  /** Execution mode controls (Auto/GPU/CPU/CUDA/Fast) */
  executionControls?: React.ReactNode;
  /** Engine/Provider selector */
  engineSelector?: React.ReactNode;
  /** Settings/configuration panel content */
  settings?: React.ReactNode;
  /** Custom settings panel title */
  settingsTitle?: string;
  /** Main content area (input, controls) */
  main?: React.ReactNode;
  /** Output area (audio player, text output) */
  output?: React.ReactNode;
  /** Sidebar panel (info, tips, metadata) */
  sidebar?: React.ReactNode;
  /** Action buttons (primary/secondary CTAs) */
  actions?: React.ReactNode;

  // === BEHAVIOR ===
  settingsCollapsible?: boolean;
  settingsDefaultOpen?: boolean;
  settingsPersistKey?: string;

  // === STATUS ===
  isLoading?: boolean;
  error?: string | null;
  onErrorDismiss?: () => void;
  warning?: string | null;
  onWarningDismiss?: () => void;
  progress?: ProgressState | null;

  className?: string;
}

// Layout configuration
const LAYOUT_CONFIG = {
  default: {
    wrapper: 'grid grid-cols-1 lg:grid-cols-3 gap-10 xl:gap-16',
    settingsLeft: 'lg:col-span-1 order-2 lg:order-1',
    settingsRight: 'lg:col-span-1 order-2 lg:order-3',
    main: 'lg:col-span-2 order-1 lg:order-2',
    mainFull: 'lg:col-span-3',
    sidebar: 'lg:col-span-1 order-3 lg:order-3',
    stickySettings: true,
    actionsInSettings: true,
  },
  split: {
    wrapper: 'grid grid-cols-1 lg:grid-cols-2 gap-6',
    settingsLeft: 'order-1',
    settingsRight: 'order-2',
    main: 'order-1',
    mainFull: 'lg:col-span-2',
    sidebar: 'order-2',
    stickySettings: false,
    actionsInSettings: true,
  },
  centered: {
    wrapper: 'flex flex-col items-center',
    settingsLeft: 'w-full max-w-4xl',
    settingsRight: 'w-full max-w-4xl',
    main: 'w-full max-w-4xl',
    mainFull: 'w-full max-w-4xl',
    sidebar: 'w-full max-w-4xl',
    stickySettings: false,
    actionsInSettings: false,
  },
  wide: {
    wrapper: 'flex flex-col',
    settingsLeft: 'w-full',
    settingsRight: 'w-full',
    main: 'w-full',
    mainFull: 'w-full',
    sidebar: 'w-full',
    stickySettings: false,
    actionsInSettings: false,
  },
  // Legacy mappings
  'input-focused': 'default',
  'processing': 'default',
  'generator': 'default',
} as const;

export function ModuleShell({
  title,
  description,
  icon,
  layout: rawLayout,
  settingsPosition = 'left',
  headerActions,
  executionControls,
  engineSelector,
  settings,
  settingsTitle = 'Settings',
  main,
  output,
  sidebar,
  actions,
  settingsCollapsible = false,
  settingsDefaultOpen = true,
  settingsPersistKey,
  isLoading = false,
  error = null,
  onErrorDismiss,
  warning = null,
  onWarningDismiss,
  progress,
  className,
}: ModuleShellProps) {
  const [showSettings, setShowSettings] = useState(settingsDefaultOpen);

  // Resolve legacy layout names
  const layout: ModuleLayout = (
    rawLayout === 'input-focused' || rawLayout === 'processing' || rawLayout === 'generator'
      ? 'default'
      : rawLayout
  );

  const config = LAYOUT_CONFIG[layout];

  // Load persisted settings state
  useEffect(() => {
    if (settingsPersistKey) {
      const stored = localStorage.getItem(settingsPersistKey);
      if (stored !== null) {
        setShowSettings(stored === 'true');
      }
    }
  }, [settingsPersistKey]);

  const handleToggleSettings = () => {
    const newState = !showSettings;
    setShowSettings(newState);

    if (settingsPersistKey) {
      localStorage.setItem(settingsPersistKey, String(newState));
    }
  };

  // Combine header actions with execution controls and settings toggle
  const allHeaderActions = (
    <div className="flex items-center gap-2 flex-wrap">
      {executionControls}
      {settingsCollapsible && (settings || engineSelector) && (
        <button
          onClick={handleToggleSettings}
          className={cn(
            'p-2 rounded-lg transition-all',
            showSettings
              ? 'bg-accent-primary/10 text-accent-primary'
              : 'text-foreground-muted hover:bg-surface-2'
          )}
          title={showSettings ? 'Hide Settings' : 'Show Settings'}
          aria-label={showSettings ? 'Hide Settings' : 'Show Settings'}
          aria-pressed={showSettings}
        >
          <Settings2 className="w-5 h-5" aria-hidden="true" />
        </button>
      )}
      {headerActions}
    </div>
  );

  const hasSettings = settings || engineSelector;
  const settingsClass = settingsPosition === 'right' ? config.settingsRight : config.settingsLeft;

  // Determine if we should render settings panel
  const renderSettingsPanel = showSettings && hasSettings;

  // Render settings panel content
  const settingsPanelContent = (
    <div
      className={cn(
        settingsClass,
        'space-y-6',
        config.stickySettings && 'lg:sticky lg:top-24'
      )}
    >
      {/* Engine selector (if provided separately) */}
      {engineSelector && (
        <div className="glass-card p-6 space-y-4">
          {engineSelector}
        </div>
      )}

      {/* Settings content */}
      {settings && (
        <div className="glass-card p-6 space-y-4">
          {(settingsTitle || settingsCollapsible) && (
            <div className="flex items-center justify-between">
              {settingsTitle && <h2 className="section-label">{settingsTitle}</h2>}
              {settingsCollapsible && (
                <button
                  onClick={handleToggleSettings}
                  className="lg:hidden text-foreground-muted hover:text-foreground"
                  title="Hide Settings"
                  aria-label="Hide Settings"
                >
                  <Settings2 className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
            </div>
          )}
          {settings}
        </div>
      )}

      {/* Actions in settings panel */}
      {config.actionsInSettings && actions && (
        <div className="space-y-2">{actions}</div>
      )}
    </div>
  );

  // Render sidebar panel
  const sidebarContent = sidebar && (
    <div className={cn(config.sidebar, 'lg:sticky lg:top-24')}>
      {sidebar}
    </div>
  );

  return (
    <div className={cn('space-y-8 animate-slide-up', className)}>
      {/* Header */}
      <ModuleHeader
        title={title}
        description={description}
        icon={icon}
        actions={allHeaderActions}
      />

      {/* Error Alert */}
      {error && (
        <StatusAlert
          variant="error"
          message={error}
          dismissible={!!onErrorDismiss}
          onDismiss={onErrorDismiss}
        />
      )}

      {/* Warning Alert */}
      {warning && (
        <StatusAlert
          variant="warning"
          message={warning}
          dismissible={!!onWarningDismiss}
          onDismiss={onWarningDismiss}
        />
      )}

      {/* Progress */}
      {progress && (
        <div className="glass-card p-4" role="progressbar" aria-valuenow={progress.value} aria-valuemin={0} aria-valuemax={100}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">
              {progress.status}
            </span>
            <span className="text-sm text-foreground-muted">
              {Math.round(progress.value)}%
            </span>
          </div>
          <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-primary transition-all duration-300"
              style={{ width: `${progress.value}%` }}
            />
          </div>
          {progress.details && (
            <p className="text-xs text-foreground-muted mt-2">
              {progress.details}
            </p>
          )}
        </div>
      )}

      {/* Main Grid */}
      <div className={config.wrapper}>
        {/* Settings Panel (left position) */}
        {renderSettingsPanel && settingsPosition === 'left' && settingsPanelContent}

        {/* Main Content */}
        <div
          className={cn(
            'space-y-6',
            renderSettingsPanel ? config.main : config.mainFull
          )}
        >
          {main}

          {/* Output */}
          {output}

          {/* Actions when not in settings panel */}
          {!config.actionsInSettings && actions && (
            <div className="flex gap-3 justify-end">{actions}</div>
          )}

          {/* Actions when settings hidden */}
          {config.actionsInSettings && !showSettings && actions && (
            <div className="pt-4 border-t border-glass-border flex gap-3 justify-end">
              {actions}
            </div>
          )}
        </div>

        {/* Settings Panel (right position) */}
        {renderSettingsPanel && settingsPosition === 'right' && settingsPanelContent}

        {/* Sidebar (for layouts that support it) */}
        {layout === 'default' && !renderSettingsPanel && sidebarContent}
      </div>

      {/* Sidebar below main content for centered/wide layouts */}
      {(layout === 'centered' || layout === 'wide') && sidebarContent}
    </div>
  );
}

export default ModuleShell;
