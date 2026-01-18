'use client';

import { useEffect, useState } from 'react';
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
  ComprehensiveModelStatus,
  HuggingFaceVerification,
} from '@/lib/api';
import { cn } from '@/lib/utils';

type Tab = 'local' | 'api' | 'diarization';

export default function ModelsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('diarization');
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
    setBusy((prev) => ({ ...prev, [modelId]: 'Downloading...' }));
    try {
      await downloadModel(modelId);
      await loadStatus();
    } catch (err: any) {
      setError(err.message || 'Download failed');
    } finally {
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
      setError(err.message || 'Remove failed');
    } finally {
      setBusy((prev) => ({ ...prev, [modelId]: '' }));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-8 h-8 animate-spin text-foreground-muted" />
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
        <p className="text-foreground-muted mt-2">
          Configure AI models and API providers
        </p>
      </div>

      {error && (
        <div className="glass-card p-4 border-red-500/30 bg-red-500/10 flex items-center gap-3 text-red-300">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
            <XCircle className="w-5 h-5" />
          </button>
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
                ? "bg-white/10 text-foreground"
                : "text-foreground-muted hover:text-foreground hover:bg-white/5"
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
        <button
          onClick={loadStatus}
          className="ml-auto p-2 text-foreground-muted hover:text-foreground hover:bg-white/5 rounded-lg"
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
              <h3 className="font-semibold text-foreground">Pyannote Speaker Detection</h3>
              <p className="text-sm text-foreground-muted">{status.diarization.message}</p>
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
                <h4 className="font-medium text-foreground">Verification Results</h4>
                <span className={cn(
                  "badge",
                  verification.all_accessible ? "badge-success" : "badge-warning"
                )}>
                  {verification.all_accessible ? "All accessible" : "Action required"}
                </span>
              </div>
              <p className="text-sm text-foreground-muted">{verification.message}</p>
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
                            <p className="text-xs text-foreground-muted mt-0.5">{model.message}</p>
                          )}
                        </div>
                      </div>
                      {(isForbidden && model.accept_url) && (
                        <a
                          href={model.accept_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-primary text-sm"
                        >
                          <ExternalLink className="w-4 h-4" />
                          Accept Terms
                        </a>
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
                <Key className="w-5 h-5 text-foreground-muted" />
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
                <a
                  href="https://huggingface.co/settings/tokens/new?tokenType=read"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary text-sm"
                >
                  <ExternalLink className="w-4 h-4" />
                  Get Token
                </a>
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
                    <a
                      href={model.accept_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-primary text-sm"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Accept Terms
                    </a>
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
                    <Cloud className={cn("w-5 h-5", provider.configured ? "text-emerald-400" : "text-foreground-muted")} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{provider.name}</h3>
                    <p className="text-xs text-foreground-muted">
                      {provider.features.join(' / ')}
                    </p>
                  </div>
                </div>
                {provider.configured ? (
                  <span className="badge badge-success">Configured</span>
                ) : (
                  <span className="badge">Not Set</span>
                )}
              </div>

              {editingProvider === id ? (
                <div className="flex gap-2 mt-3">
                  <input
                    type={showKey ? "text" : "password"}
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder={`${provider.name} API key...`}
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
                    <span className="text-sm text-foreground-muted font-mono bg-white/5 px-2 py-1 rounded">
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
              {status.local_models.tts.map((model) => (
                <div key={model.id} className="glass-card p-4 flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">{model.name}</h4>
                    <p className="text-sm text-foreground-muted">{model.size_mb} MB</p>
                  </div>
                  {model.installed ? (
                    <div className="flex items-center gap-2">
                      <span className="badge badge-success">Installed</span>
                      <button
                        onClick={() => handleDeleteModel(model.id)}
                        disabled={!!busy[model.id]}
                        className="btn btn-danger text-sm"
                      >
                        <Trash2 className="w-4 h-4" />
                        {busy[model.id] || 'Remove'}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleDownloadModel(model.id)}
                      disabled={!!busy[model.id]}
                      className="btn btn-primary text-sm"
                    >
                      <Download className="w-4 h-4" />
                      {busy[model.id] || 'Download'}
                    </button>
                  )}
                </div>
              ))}
              {status.local_models.tts.length === 0 && (
                <p className="text-foreground-muted col-span-2">No TTS models available</p>
              )}
            </div>
          </div>

          {/* STT Models */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Speech-to-Text Models</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {status.local_models.stt.map((model) => (
                <div key={model.id} className="glass-card p-4 flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">{model.name}</h4>
                    <p className="text-sm text-foreground-muted">{model.size_mb} MB</p>
                  </div>
                  {model.installed ? (
                    <div className="flex items-center gap-2">
                      <span className="badge badge-success">Installed</span>
                      <button
                        onClick={() => handleDeleteModel(model.id)}
                        disabled={!!busy[model.id]}
                        className="btn btn-danger text-sm"
                      >
                        <Trash2 className="w-4 h-4" />
                        {busy[model.id] || 'Remove'}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleDownloadModel(model.id)}
                      disabled={!!busy[model.id]}
                      className="btn btn-primary text-sm"
                    >
                      <Download className="w-4 h-4" />
                      {busy[model.id] || 'Download'}
                    </button>
                  )}
                </div>
              ))}
              {status.local_models.stt.length === 0 && (
                <p className="text-foreground-muted col-span-2">No STT models available</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
