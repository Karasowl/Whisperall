'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Download,
  Trash2,
  Loader2,
  HardDrive,
  AlertCircle,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Key,
  RefreshCw,
  Cloud,
  Users,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  getComprehensiveModelStatus,
  verifyHuggingFaceAccess,
  setProviderApiKey,
  deleteProviderApiKey,
  downloadModel,
  deleteModel,
  getDownloadProgress,
  ComprehensiveModelStatus,
  HuggingFaceVerification,
} from '@/lib/api';
import { cn } from '@/lib/utils';

type Tab = 'local' | 'api' | 'diarization';

// Helper function to extract help links from error messages
function getErrorHelpInfo(error: string): { helpText?: string; linkUrl?: string; linkText?: string } {
  const errorLower = error.toLowerCase();

  if (errorLower.includes('huggingface token') || errorLower.includes('authentication required')) {
    return {
      helpText: 'Configure your HuggingFace token to access gated models.',
      linkUrl: 'https://huggingface.co/settings/tokens',
      linkText: 'Get HuggingFace Token',
    };
  }
  if (errorLower.includes('license agreement') || errorLower.includes('accept the terms') || errorLower.includes('access denied')) {
    return {
      helpText: 'Visit the model page on HuggingFace and accept the license agreement.',
      linkUrl: 'https://huggingface.co',
      linkText: 'Visit HuggingFace',
    };
  }
  if (errorLower.includes('disk space') || errorLower.includes('no space')) {
    return {
      helpText: 'Free up disk space before downloading large models.',
    };
  }
  if (errorLower.includes('connection') || errorLower.includes('timeout')) {
    return {
      helpText: 'Check your internet connection and try again.',
    };
  }
  return {};
}

// Wrapper component to handle Suspense for useSearchParams
export default function ModelsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    }>
      <ModelsPageContent />
    </Suspense>
  );
}

function ModelsPageContent() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab') as Tab | null;
  const [activeTab, setActiveTab] = useState<Tab>(tabParam || 'diarization');
  const [status, setStatus] = useState<ComprehensiveModelStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [verification, setVerification] = useState<HuggingFaceVerification | null>(null);

  // API Key editing state
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);

  const loadStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getComprehensiveModelStatus();
      setStatus(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load model status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleVerifyHuggingFace = async () => {
    setVerifying(true);
    try {
      const result = await verifyHuggingFaceAccess();
      setVerification(result);
      await loadStatus();
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setVerifying(false);
    }
  };

  const handleSaveApiKey = async (provider: string) => {
    setSavingKey(true);
    try {
      await setProviderApiKey(provider, apiKeyInput);
      setEditingProvider(null);
      setApiKeyInput('');
      await loadStatus();
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setSavingKey(false);
    }
  };

  const handleDeleteApiKey = async (provider: string) => {
    if (!confirm(`Remove API key for ${provider}?`)) return;
    try {
      await deleteProviderApiKey(provider);
      await loadStatus();
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message);
    }
  };

  const handleDownloadModel = async (modelId: string) => {
    setBusy((prev) => ({ ...prev, [modelId]: 'Starting...' }));
    try {
      const result = await downloadModel(modelId);

      // If already installed, just refresh
      if (result.already_installed) {
        await loadStatus();
        return;
      }

      // Poll for progress
      let pollAttempts = 0;
      const maxPollAttempts = 600;  // 10 minutes max

      const pollProgress = async () => {
        pollAttempts++;
        const progress = await getDownloadProgress(modelId);

        if (progress.status === 'downloading') {
          const pct = progress.progress || 0;
          setBusy((prev) => ({ ...prev, [modelId]: `${pct}%` }));
          setTimeout(pollProgress, 1000);  // Poll every second
        } else if (progress.status === 'completed') {
          setBusy((prev) => ({ ...prev, [modelId]: '' }));
          await loadStatus();
        } else if (progress.status === 'error') {
          setBusy((prev) => ({ ...prev, [modelId]: '' }));
          setError(progress.error || 'Download failed');
          await loadStatus();
        } else if (progress.status === 'not_started' && pollAttempts < maxPollAttempts) {
          // Download not yet initialized, keep polling
          setBusy((prev) => ({ ...prev, [modelId]: 'Starting...' }));
          setTimeout(pollProgress, 1000);
        }
      };

      // Start polling immediately
      pollProgress();
    } catch (err: any) {
      // Extract detailed error from FastAPI response
      const errorDetail = err.response?.data?.detail || err.message || 'Download failed';
      setError(errorDetail);
      setBusy((prev) => ({ ...prev, [modelId]: '' }));
    }
  };

  const handleDeleteModel = async (modelId: string) => {
    if (!confirm('Remove this model from disk?')) return;
    setBusy((prev) => ({ ...prev, [modelId]: 'Removing...' }));
    try {
      await deleteModel(modelId);
      await loadStatus();
    } catch (err: any) {
      // Extract detailed error from FastAPI response
      const errorDetail = err.response?.data?.detail || err.message || 'Remove failed';
      setError(errorDetail);
    } finally {
      setBusy((prev) => ({ ...prev, [modelId]: '' }));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const tabs = [
    { id: 'diarization' as Tab, label: 'Speaker Detection', icon: Users },
    { id: 'api' as Tab, label: 'API Providers', icon: Cloud },
    { id: 'local' as Tab, label: 'Local Models', icon: HardDrive },
  ];

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gradient">Model Management</h1>
        <p className="text-slate-400 mt-2">
          Configure AI models and API providers
        </p>
      </div>

      {error && (
        <div className="glass-card p-4 border-red-500/30 bg-red-500/10 text-red-300">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="flex-1 space-y-2">
              <p>{error}</p>
              {(() => {
                const helpInfo = getErrorHelpInfo(error);
                if (!helpInfo.helpText && !helpInfo.linkUrl) return null;
                return (
                  <div className="flex flex-wrap items-center gap-3 text-sm text-red-300/80">
                    {helpInfo.helpText && <span>{helpInfo.helpText}</span>}
                    {helpInfo.linkUrl && (
                      <button
                        onClick={() => {
                          if (window.electronAPI?.openExternal) {
                            window.electronAPI.openExternal(helpInfo.linkUrl!);
                          } else {
                            window.open(helpInfo.linkUrl, '_blank');
                          }
                        }}
                        className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 underline"
                      >
                        {helpInfo.linkText || 'Learn more'}
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300 flex-shrink-0">
              <XCircle className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/10 pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg transition-colors",
              activeTab === tab.id
                ? "bg-white/10 text-slate-100"
                : "text-slate-400 hover:text-slate-100 hover:bg-white/5"
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
        <button
          onClick={loadStatus}
          className="ml-auto p-2 text-slate-400 hover:text-slate-100 hover:bg-white/5 rounded-lg"
          title="Refresh status"
        >
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
        </button>
      </div>

      {/* Diarization Tab */}
      {activeTab === 'diarization' && status && (
        <div className="space-y-4">
          {/* Overall Status */}
          <div className={cn(
            "glass-card p-4 flex items-center gap-4",
            status.diarization.status === 'ready' && "border-emerald-500/30 bg-emerald-500/5",
            status.diarization.status === 'terms_required' && "border-amber-500/30 bg-amber-500/5",
            status.diarization.status === 'runtime_error' && "border-amber-500/30 bg-amber-500/5",
            status.diarization.status === 'not_configured' && "border-red-500/30 bg-red-500/5",
          )}>
            {status.diarization.status === 'ready' ? (
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            ) : status.diarization.status === 'terms_required' || status.diarization.status === 'runtime_error' ? (
              <AlertCircle className="w-8 h-8 text-amber-400" />
            ) : (
              <XCircle className="w-8 h-8 text-red-400" />
            )}
            <div className="flex-1">
              <h3 className="font-semibold text-slate-100">Pyannote Speaker Detection</h3>
              <p className="text-sm text-slate-400">{status.diarization.message}</p>
            </div>
            <button
              onClick={handleVerifyHuggingFace}
              disabled={verifying || !status.diarization.token_configured}
              className="btn btn-secondary"
            >
              {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Verify Access
            </button>
          </div>

          {verification && (
            <div className="glass-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-slate-100">Verification Results</h4>
                <span className={cn(
                  "badge",
                  verification.all_accessible ? "badge-success" : "badge-warning"
                )}>
                  {verification.all_accessible ? "All accessible" : "Action required"}
                </span>
              </div>
              <p className="text-sm text-slate-400">{verification.message}</p>
              <div className="space-y-2">
                {verification.models.map((model) => {
                  const displayName = model.name || model.model;
                  const isOk = model.status === 'ok';
                  const isForbidden = model.status === 'forbidden';
                  return (
                    <div
                      key={model.model}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-lg",
                        isOk ? "bg-emerald-500/10" : isForbidden ? "bg-amber-500/10" : "bg-red-500/10"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        {isOk ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        ) : isForbidden ? (
                          <AlertCircle className="w-5 h-5 text-amber-400" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-400" />
                        )}
                        <div>
                          <span className="font-medium">{displayName}</span>
                          {model.required && <span className="ml-2 badge text-xs">Required</span>}
                          {model.message && (
                            <p className="text-xs text-slate-400 mt-0.5">{model.message}</p>
                          )}
                        </div>
                      </div>
                      {(isForbidden && model.accept_url) && (
                        <button
                          onClick={() => {
                            if (window.electronAPI?.openExternal) {
                              window.electronAPI.openExternal(model.accept_url!);
                            } else {
                              window.open(model.accept_url, '_blank');
                            }
                          }}
                          className="btn btn-primary text-sm"
                        >
                          <ExternalLink className="w-4 h-4" />
                          Accept Terms
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* HuggingFace Token */}
          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-slate-400" />
                <span className="font-medium">HuggingFace Token</span>
              </div>
              {status.diarization.token_configured ? (
                <span className="badge badge-success">Configured</span>
              ) : (
                <span className="badge badge-danger">Not Set</span>
              )}
            </div>

            {editingProvider === 'huggingface' ? (
              <div className="flex gap-2">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="hf_xxxxxxxxxxxxxxxx"
                  className="input flex-1 font-mono text-sm"
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="btn btn-secondary px-3"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => handleSaveApiKey('huggingface')}
                  disabled={savingKey || !apiKeyInput.trim()}
                  className="btn btn-primary"
                >
                  {savingKey ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
                </button>
                <button
                  onClick={() => { setEditingProvider(null); setApiKeyInput(''); }}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const url = "https://huggingface.co/settings/tokens/new?tokenType=read";
                    if (window.electronAPI?.openExternal) {
                      window.electronAPI.openExternal(url);
                    } else {
                      window.open(url, '_blank');
                    }
                  }}
                  className="btn btn-secondary text-sm"
                >
                  <ExternalLink className="w-4 h-4" />
                  Get Token
                </button>
                <button
                  onClick={() => setEditingProvider('huggingface')}
                  className="btn btn-primary text-sm"
                >
                  <Key className="w-4 h-4" />
                  {status.diarization.token_configured ? 'Change Token' : 'Add Token'}
                </button>
              </div>
            )}
          </div>

          {/* Required Models */}
          <div className="glass-card p-4">
            <h4 className="font-medium mb-3">Required Models (Accept Terms on HuggingFace)</h4>
            <div className="space-y-2">
              {status.diarization.models.map((model) => (
                <div
                  key={model.id}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-lg",
                    model.accessible ? "bg-emerald-500/10" : "bg-white/5"
                  )}
                >
                  <div className="flex items-center gap-3">
                    {model.accessible ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-400" />
                    )}
                    <div>
                      <span className="font-medium">{model.name}</span>
                      {model.required && <span className="ml-2 badge text-xs">Required</span>}
                      {model.error && (
                        <p className="text-xs text-red-400 mt-0.5">{model.error}</p>
                      )}
                    </div>
                  </div>
                  {!model.accessible && (
                    <button
                      onClick={() => {
                        if (window.electronAPI?.openExternal) {
                          window.electronAPI.openExternal(model.accept_url);
                        } else {
                          window.open(model.accept_url, '_blank');
                        }
                      }}
                      className="btn btn-primary text-sm"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Accept Terms
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* API Providers Tab */}
      {activeTab === 'api' && status && (
        <div className="grid gap-4">
          {Object.entries(status.api_providers).map(([id, provider]) => (
            <div key={id} className="glass-card p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center",
                    provider.configured ? "bg-emerald-500/20" : "bg-white/10"
                  )}>
                    <Cloud className={cn("w-5 h-5", provider.configured ? "text-emerald-400" : "text-slate-400")} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-100">{provider.name}</h3>
                    <p className="text-xs text-slate-400">
                      {provider.features.map((feature) => feature.replace('_', ' ')).join(' / ')}
                    </p>
                  </div>
                </div>
                {provider.configured ? (
                  <span className="badge badge-success">Configured</span>
                ) : (
                  <span className="badge">Not Set</span>
                )}
              </div>

              {provider.description && (
                <p className="text-xs text-slate-400">{provider.description}</p>
              )}
              {provider.supported && (
                <p className="text-xs text-slate-400 mt-1">
                  Supported here:{' '}
                  {Object.entries(provider.supported)
                    .filter(([, value]) => value)
                    .map(([key]) => key.replace('_', ' '))
                    .join(', ') || 'Not wired yet'}
                </p>
              )}
              {(provider.pricing_unit || provider.pricing_note) && (
                <p className="text-xs text-slate-400 mt-1">
                  Pricing: {provider.pricing_unit || 'See pricing page'}
                  {provider.pricing_note ? ` (${provider.pricing_note})` : ''}
                </p>
              )}
              {(provider.docs_url || provider.pricing_url || provider.console_url) && (
                <div className="flex flex-wrap gap-2 text-xs text-slate-400 mt-2">
                  {provider.docs_url && (
                    <button
                      onClick={() => {
                        if (window.electronAPI?.openExternal) {
                          window.electronAPI.openExternal(provider.docs_url!);
                        } else {
                          window.open(provider.docs_url, '_blank');
                        }
                      }}
                      className="underline hover:text-white"
                    >
                      Docs
                    </button>
                  )}
                  {provider.pricing_url && (
                    <button
                      onClick={() => {
                        if (window.electronAPI?.openExternal) {
                          window.electronAPI.openExternal(provider.pricing_url!);
                        } else {
                          window.open(provider.pricing_url, '_blank');
                        }
                      }}
                      className="underline hover:text-white"
                    >
                      Pricing
                    </button>
                  )}
                  {provider.console_url && (
                    <button
                      onClick={() => {
                        if (window.electronAPI?.openExternal) {
                          window.electronAPI.openExternal(provider.console_url!);
                        } else {
                          window.open(provider.console_url, '_blank');
                        }
                      }}
                      className="underline hover:text-white"
                    >
                      Get Key
                    </button>
                  )}
                </div>
              )}
              {provider.key_instructions && (
                <p className="text-xs text-slate-400 mt-2">{provider.key_instructions}</p>
              )}

              {editingProvider === id ? (
                <div className="flex gap-2 mt-3">
                  <input
                    type={showKey ? "text" : "password"}
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder={provider.key_label ? `Enter ${provider.key_label}` : `${provider.name} API key...`}
                    className="input flex-1 font-mono text-sm"
                  />
                  <button onClick={() => setShowKey(!showKey)} className="btn btn-secondary px-3">
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => handleSaveApiKey(id)}
                    disabled={savingKey || !apiKeyInput.trim()}
                    className="btn btn-primary"
                  >
                    {savingKey ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
                  </button>
                  <button
                    onClick={() => { setEditingProvider(null); setApiKeyInput(''); }}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex gap-2 mt-3">
                  {provider.key_preview && (
                    <span className="text-sm text-slate-400 font-mono bg-white/5 px-2 py-1 rounded">
                      {provider.key_preview}
                    </span>
                  )}
                  <button
                    onClick={() => { setEditingProvider(id); setApiKeyInput(''); }}
                    className="btn btn-secondary text-sm"
                  >
                    <Key className="w-4 h-4" />
                    {provider.configured ? 'Change' : 'Add Key'}
                  </button>
                  {provider.configured && (
                    <button
                      onClick={() => handleDeleteApiKey(id)}
                      className="btn btn-danger text-sm"
                    >
                      <Trash2 className="w-4 h-4" />
                      Remove
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Local Models Tab */}
      {activeTab === 'local' && status && (
        <div className="space-y-6">
          {/* TTS Models */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Text-to-Speech Models</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {status.local_models.tts.map((model) => {
                const isBusy = !!busy[model.id];
                const progressMatch = busy[model.id]?.match(/(\d+)%/);
                const progressPct = progressMatch ? parseInt(progressMatch[1], 10) : 0;
                const isDownloading = isBusy && progressMatch;
                const isStarting = isBusy && !progressMatch;

                return (
                  <div key={model.id} className="glass-card p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium">{model.name}</h4>
                        <p className="text-sm text-slate-400">{model.size_mb} MB</p>
                      </div>
                      {model.installed ? (
                        <div className="flex items-center gap-2">
                          <span className="badge badge-success">Installed</span>
                          <button
                            onClick={() => handleDeleteModel(model.id)}
                            disabled={isBusy}
                            className="btn btn-danger text-sm"
                          >
                            <Trash2 className="w-4 h-4" />
                            {busy[model.id] || 'Remove'}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleDownloadModel(model.id)}
                          disabled={isBusy}
                          className="btn btn-primary text-sm"
                        >
                          {isBusy ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
                          {busy[model.id] || 'Download'}
                        </button>
                      )}
                    </div>
                    {/* Starting state */}
                    {isStarting && (
                      <div className="mt-3">
                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-emerald-500/50 to-teal-500/50 animate-pulse w-full" />
                        </div>
                        <p className="text-xs text-slate-400 mt-1 text-center flex items-center justify-center gap-2">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Connecting to HuggingFace...
                        </p>
                      </div>
                    )}
                    {/* Progress bar during download */}
                    {isDownloading && (
                      <div className="mt-3">
                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-300"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                        <p className="text-xs text-slate-400 mt-1 text-center">
                          Downloading... {progressPct}% ({Math.round(model.size_mb * progressPct / 100)} / {model.size_mb} MB)
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
              {status.local_models.tts.length === 0 && (
                <p className="text-slate-400 col-span-2">No TTS models available</p>
              )}
            </div>
          </div>

          {/* STT Models */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Speech-to-Text Models</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {status.local_models.stt.map((model) => {
                const isBusy = !!busy[model.id];
                const progressMatch = busy[model.id]?.match(/(\d+)%/);
                const progressPct = progressMatch ? parseInt(progressMatch[1], 10) : 0;
                const isDownloading = isBusy && progressMatch;
                const isStarting = isBusy && !progressMatch;

                return (
                  <div key={model.id} className="glass-card p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium">{model.name}</h4>
                        <p className="text-sm text-slate-400">{model.size_mb} MB</p>
                      </div>
                      {model.installed ? (
                        <div className="flex items-center gap-2">
                          <span className="badge badge-success">Installed</span>
                          <button
                            onClick={() => handleDeleteModel(model.id)}
                            disabled={isBusy}
                            className="btn btn-danger text-sm"
                          >
                            <Trash2 className="w-4 h-4" />
                            {busy[model.id] || 'Remove'}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleDownloadModel(model.id)}
                          disabled={isBusy}
                          className="btn btn-primary text-sm"
                        >
                          {isBusy ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
                          {busy[model.id] || 'Download'}
                        </button>
                      )}
                    </div>
                    {/* Starting state */}
                    {isStarting && (
                      <div className="mt-3">
                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-blue-500/50 to-cyan-500/50 animate-pulse w-full" />
                        </div>
                        <p className="text-xs text-slate-400 mt-1 text-center flex items-center justify-center gap-2">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Connecting to HuggingFace...
                        </p>
                      </div>
                    )}
                    {/* Progress bar during download */}
                    {isDownloading && (
                      <div className="mt-3">
                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-300"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                        <p className="text-xs text-slate-400 mt-1 text-center">
                          Downloading... {progressPct}% ({Math.round(model.size_mb * progressPct / 100)} / {model.size_mb} MB)
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
              {status.local_models.stt.length === 0 && (
                <p className="text-slate-400 col-span-2">No STT models available</p>
              )}
            </div>
          </div>

          {/* Translation Models */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Translation Models</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {status.local_models.translation.map((model) => {
                const isBusy = !!busy[model.id];
                const progressMatch = busy[model.id]?.match(/(\d+)%/);
                const progressPct = progressMatch ? parseInt(progressMatch[1], 10) : 0;
                const isDownloading = isBusy && progressMatch;
                const isStarting = isBusy && !progressMatch;

                return (
                  <div key={model.id} className="glass-card p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium">{model.name}</h4>
                        <p className="text-sm text-slate-400">{model.size_mb} MB</p>
                      </div>
                      {model.installed ? (
                        <div className="flex items-center gap-2">
                          <span className="badge badge-success">Installed</span>
                          <button
                            onClick={() => handleDeleteModel(model.id)}
                            disabled={isBusy}
                            className="btn btn-danger text-sm"
                          >
                            <Trash2 className="w-4 h-4" />
                            {busy[model.id] || 'Remove'}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleDownloadModel(model.id)}
                          disabled={isBusy}
                          className="btn btn-primary text-sm"
                        >
                          {isBusy ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
                          {busy[model.id] || 'Download'}
                        </button>
                      )}
                    </div>
                    {isStarting && (
                      <div className="mt-3">
                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-purple-500/50 to-indigo-500/50 animate-pulse w-full" />
                        </div>
                        <p className="text-xs text-slate-400 mt-1 text-center flex items-center justify-center gap-2">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Preparing translation package...
                        </p>
                      </div>
                    )}
                    {isDownloading && (
                      <div className="mt-3">
                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-300"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                        <p className="text-xs text-slate-400 mt-1 text-center">
                          Downloading... {progressPct}% ({Math.round(model.size_mb * progressPct / 100)} / {model.size_mb} MB)
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
              {status.local_models.translation.length === 0 && (
                <p className="text-slate-400 col-span-2">No translation models available</p>
              )}
            </div>
          </div>

          {/* Local Providers */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Local Services</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {status.local_providers.map((provider) => (
                <div key={`${provider.service}-${provider.id}`} className="glass-card p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium">{provider.name}</h4>
                      <p className="text-sm text-slate-400 capitalize">{provider.service.replace('_', ' ')}</p>
                    </div>
                    <span className={cn(
                      "badge",
                      provider.is_available ? "badge-success" : "badge-warning"
                    )}>
                      {provider.is_available ? "Running" : "Not ready"}
                    </span>
                  </div>
                  {provider.description && (
                    <p className="text-xs text-slate-400 mt-2">{provider.description}</p>
                  )}
                  {provider.base_url && (
                    <p className="text-xs text-slate-400 mt-2">
                      Base URL: <span className="font-mono">{provider.base_url}</span>
                    </p>
                  )}
                  {!provider.is_available && (
                    <p className="text-xs text-amber-400 mt-2">
                      Start the service or verify the URL to enable it.
                    </p>
                  )}
                  {provider.docs_url && (
                    <button
                      onClick={() => {
                        if (window.electronAPI?.openExternal) {
                          window.electronAPI.openExternal(provider.docs_url!);
                        } else {
                          window.open(provider.docs_url, '_blank');
                        }
                      }}
                      className="inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 mt-2 underline"
                    >
                      Docs
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
              {status.local_providers.length === 0 && (
                <p className="text-slate-400 col-span-2">No local services detected</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
