'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Bug,
  Download,
  Copy,
  AlertTriangle,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Cpu,
  HardDrive,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getDiagnosticsStatus,
  getErrors,
  downloadBundle,
  getBugReport,
  getSystemInfo,
  type DiagnosticsStatus,
  type ErrorGroup,
  type SystemInfo,
  type VersionsInfo,
} from '@/lib/diagnosticsApi';
import { useDevMode } from '@/components/DevModeProvider';

interface DevDiagnosticsProps {
  collapsed?: boolean;
}

type TabId = 'errors' | 'system';

export function DevDiagnostics({ collapsed = false }: DevDiagnosticsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<DiagnosticsStatus | null>(null);
  const [errors, setErrors] = useState<ErrorGroup[]>([]);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [versions, setVersions] = useState<VersionsInfo | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('errors');
  const [loading, setLoading] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [expandedFingerprint, setExpandedFingerprint] = useState<string | null>(
    null
  );

  // Check if dev mode is enabled
  const { devMode: devModeEnabled } = useDevMode();

  // Fetch status on mount and periodically
  useEffect(() => {
    if (!devModeEnabled) return;

    const fetchStatus = async () => {
      try {
        const data = await getDiagnosticsStatus();
        setStatus(data);
      } catch {
        // Silently fail
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [devModeEnabled]);

  // Fetch data when panel opens
  const loadData = useCallback(async () => {
    if (!isOpen) return;

    setLoading(true);
    try {
      const [errorsData, systemData] = await Promise.all([
        getErrors(50),
        getSystemInfo(),
      ]);
      setErrors(errorsData.grouped);
      setSystemInfo(systemData.system);
      setVersions(systemData.versions);
    } catch (error) {
      console.error('[DevDiagnostics] Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }, [isOpen]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle copy bug report
  const handleCopyBugReport = async () => {
    setCopying(true);
    try {
      const data = await getBugReport();
      if (data.report) {
        await navigator.clipboard.writeText(data.report);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (error) {
      console.error('[DevDiagnostics] Failed to copy bug report:', error);
    } finally {
      setCopying(false);
    }
  };

  // Handle download bundle
  const handleDownloadBundle = async () => {
    setDownloading(true);
    try {
      const blob = await downloadBundle({ last_n_events: 200 });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `whisperall_diagnostic_${new Date()
        .toISOString()
        .replace(/[:.]/g, '-')}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('[DevDiagnostics] Failed to download bundle:', error);
    } finally {
      setDownloading(false);
    }
  };

  if (!devModeEnabled) return null;

  const errorCount = status?.unique_errors ?? 0;

  return (
    <div className="relative">
      {/* Main Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all',
          'text-foreground-muted hover:text-foreground hover:bg-surface-2',
          errorCount > 0 && 'text-amber-400 hover:text-amber-300',
          collapsed && 'justify-center px-2'
        )}
        title={collapsed ? `Dev Diagnostics (${errorCount} errors)` : undefined}
      >
        <Bug className="w-5 h-5 shrink-0" />
        {!collapsed && (
          <>
            <span className="truncate">Dev Diagnostics</span>
            {errorCount > 0 && (
              <span className="ml-auto px-1.5 py-0.5 text-xs bg-amber-500/20 text-amber-400 rounded-full">
                {errorCount}
              </span>
            )}
          </>
        )}

        {/* Collapsed tooltip */}
        {collapsed && (
          <div className="absolute left-full ml-2 px-2 py-1 bg-surface-base border border-glass-border rounded-md text-xs text-foreground opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 whitespace-nowrap">
            Dev Diagnostics {errorCount > 0 && `(${errorCount})`}
          </div>
        )}
      </button>

      {/* Expanded Panel */}
      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-80 max-h-[70vh] bg-surface-base border border-glass-border rounded-xl shadow-xl overflow-hidden z-50">
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-glass-border bg-surface-1">
            <h3 className="font-medium text-sm">Dev Diagnostics</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-surface-2 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 p-3 border-b border-glass-border">
            <button
              onClick={handleDownloadBundle}
              disabled={downloading}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20 rounded-lg transition-colors disabled:opacity-50"
            >
              {downloading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              Bundle
            </button>
            <button
              onClick={handleCopyBugReport}
              disabled={copying || errorCount === 0}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-surface-2 hover:bg-surface-3 rounded-lg transition-colors disabled:opacity-50"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-green-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              {copied ? 'Copied!' : 'Bug Report'}
            </button>
            <button
              onClick={loadData}
              disabled={loading}
              className="p-2 bg-surface-2 hover:bg-surface-3 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw
                className={cn('w-3.5 h-3.5', loading && 'animate-spin')}
              />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-glass-border">
            <button
              onClick={() => setActiveTab('errors')}
              className={cn(
                'flex-1 px-3 py-2 text-xs font-medium transition-colors',
                activeTab === 'errors'
                  ? 'text-accent-primary border-b-2 border-accent-primary'
                  : 'text-foreground-muted hover:text-foreground'
              )}
            >
              Errors ({errorCount})
            </button>
            <button
              onClick={() => setActiveTab('system')}
              className={cn(
                'flex-1 px-3 py-2 text-xs font-medium transition-colors',
                activeTab === 'system'
                  ? 'text-accent-primary border-b-2 border-accent-primary'
                  : 'text-foreground-muted hover:text-foreground'
              )}
            >
              System
            </button>
          </div>

          {/* Content */}
          <div className="overflow-y-auto max-h-[40vh] custom-scrollbar">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-foreground-muted" />
              </div>
            ) : activeTab === 'errors' ? (
              <ErrorsTab
                errors={errors}
                expandedFingerprint={expandedFingerprint}
                setExpandedFingerprint={setExpandedFingerprint}
              />
            ) : (
              <SystemTab systemInfo={systemInfo} versions={versions} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Errors Tab Component
function ErrorsTab({
  errors,
  expandedFingerprint,
  setExpandedFingerprint,
}: {
  errors: ErrorGroup[];
  expandedFingerprint: string | null;
  setExpandedFingerprint: (fp: string | null) => void;
}) {
  if (errors.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-foreground-muted">
        <Check className="w-8 h-8 mb-2 text-green-400" />
        <p className="text-sm">No errors recorded</p>
      </div>
    );
  }

  // Group by module
  const byModule = errors.reduce(
    (acc, error) => {
      const module = error.module || 'unknown';
      if (!acc[module]) acc[module] = [];
      acc[module].push(error);
      return acc;
    },
    {} as Record<string, ErrorGroup[]>
  );

  return (
    <div className="divide-y divide-glass-border">
      {Object.entries(byModule).map(([module, moduleErrors]) => (
        <div key={module} className="p-3">
          <h4 className="text-xs font-medium text-foreground-muted uppercase mb-2">
            {module} ({moduleErrors.reduce((sum, e) => sum + e.count, 0)})
          </h4>
          <div className="space-y-2">
            {moduleErrors.map((error) => (
              <div
                key={error.fingerprint}
                className="bg-surface-2 rounded-lg overflow-hidden"
              >
                <button
                  onClick={() =>
                    setExpandedFingerprint(
                      expandedFingerprint === error.fingerprint
                        ? null
                        : error.fingerprint
                    )
                  }
                  className="w-full flex items-center gap-2 p-2 text-left hover:bg-surface-3 transition-colors"
                >
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">
                      {error.error_name || 'Unknown Error'}
                    </p>
                    <p className="text-[10px] text-foreground-muted truncate">
                      {error.message}
                    </p>
                  </div>
                  <span className="px-1.5 py-0.5 text-[10px] bg-amber-500/20 text-amber-400 rounded-full shrink-0">
                    {error.count}x
                  </span>
                  {expandedFingerprint === error.fingerprint ? (
                    <ChevronUp className="w-4 h-4 text-foreground-muted shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-foreground-muted shrink-0" />
                  )}
                </button>

                {expandedFingerprint === error.fingerprint && (
                  <div className="px-3 pb-3 text-[10px] space-y-1 border-t border-glass-border pt-2">
                    <p>
                      <span className="text-foreground-muted">Fingerprint:</span>{' '}
                      <code className="text-accent-primary">
                        {error.fingerprint}
                      </code>
                    </p>
                    {error.function && (
                      <p>
                        <span className="text-foreground-muted">Function:</span>{' '}
                        {error.function}
                      </p>
                    )}
                    <p>
                      <span className="text-foreground-muted">Last seen:</span>{' '}
                      {new Date(error.last_seen).toLocaleString()}
                    </p>
                    <p>
                      <span className="text-foreground-muted">Retryable:</span>{' '}
                      {error.retryable ? (
                        <span className="text-green-400">Yes</span>
                      ) : (
                        <span className="text-red-400">No</span>
                      )}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// System Tab Component
function SystemTab({
  systemInfo,
  versions,
}: {
  systemInfo: SystemInfo | null;
  versions: VersionsInfo | null;
}) {
  if (!systemInfo || !versions) {
    return (
      <div className="flex items-center justify-center py-8 text-foreground-muted">
        <p className="text-sm">Loading system info...</p>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-4 text-xs">
      {/* Version */}
      <div>
        <h4 className="font-medium text-foreground-muted uppercase mb-2">
          Application
        </h4>
        <div className="bg-surface-2 rounded-lg p-2 space-y-1">
          <p>
            <span className="text-foreground-muted">Version:</span>{' '}
            {versions.app.version}
          </p>
          <p>
            <span className="text-foreground-muted">Build:</span>{' '}
            {versions.app.build || 'dev'}
          </p>
          <p>
            <span className="text-foreground-muted">Platform:</span>{' '}
            {versions.platform.system} {versions.platform.release}
          </p>
        </div>
      </div>

      {/* GPU */}
      {systemInfo.gpu && (
        <div>
          <h4 className="font-medium text-foreground-muted uppercase mb-2 flex items-center gap-1">
            <Cpu className="w-3 h-3" /> GPU
          </h4>
          <div className="bg-surface-2 rounded-lg p-2 space-y-1">
            {systemInfo.gpu.available === false ? (
              <p className="text-amber-400">CUDA not available</p>
            ) : (
              <>
                {systemInfo.gpu.devices?.map((device) => (
                  <p key={device.index}>
                    <span className="text-foreground-muted">
                      GPU {device.index}:
                    </span>{' '}
                    {device.name} ({device.total_memory_gb}GB)
                  </p>
                ))}
                {systemInfo.gpu.memory_allocated_gb !== undefined && (
                  <p>
                    <span className="text-foreground-muted">VRAM Used:</span>{' '}
                    {systemInfo.gpu.memory_allocated_gb.toFixed(2)}GB /{' '}
                    {systemInfo.gpu.memory_reserved_gb?.toFixed(2)}GB reserved
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Memory */}
      {systemInfo.memory && (
        <div>
          <h4 className="font-medium text-foreground-muted uppercase mb-2 flex items-center gap-1">
            <HardDrive className="w-3 h-3" /> Memory
          </h4>
          <div className="bg-surface-2 rounded-lg p-2 space-y-1">
            <p>
              <span className="text-foreground-muted">RAM:</span>{' '}
              {systemInfo.memory.available_gb.toFixed(1)}GB /{' '}
              {systemInfo.memory.total_gb.toFixed(1)}GB (
              {systemInfo.memory.percent_used}% used)
            </p>
            {systemInfo.disk && (
              <p>
                <span className="text-foreground-muted">Disk:</span>{' '}
                {systemInfo.disk.free_gb.toFixed(1)}GB free /{' '}
                {systemInfo.disk.total_gb.toFixed(1)}GB (
                {systemInfo.disk.percent_used}% used)
              </p>
            )}
          </div>
        </div>
      )}

      {/* Python */}
      <div>
        <h4 className="font-medium text-foreground-muted uppercase mb-2">
          Python
        </h4>
        <div className="bg-surface-2 rounded-lg p-2 space-y-1">
          <p className="truncate">
            <span className="text-foreground-muted">Version:</span>{' '}
            {versions.python.version.split(' ')[0]}
          </p>
          {versions.torch?.version && (
            <p>
              <span className="text-foreground-muted">PyTorch:</span>{' '}
              {versions.torch.version}
              {versions.torch.cuda_version &&
                ` (CUDA ${versions.torch.cuda_version})`}
            </p>
          )}
        </div>
      </div>

      {/* FFmpeg */}
      {systemInfo.ffmpeg && (
        <div>
          <h4 className="font-medium text-foreground-muted uppercase mb-2">
            FFmpeg
          </h4>
          <div className="bg-surface-2 rounded-lg p-2">
            {systemInfo.ffmpeg.available ? (
              <p className="truncate text-[10px]">
                {systemInfo.ffmpeg.version}
              </p>
            ) : (
              <p className="text-amber-400">Not installed</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
