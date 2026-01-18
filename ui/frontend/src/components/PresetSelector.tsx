'use client';

import { useState, useEffect } from 'react';
import { Bookmark, BookmarkPlus, Trash2, Star, ChevronDown } from 'lucide-react';
import { Preset, getPresets, createPreset, deletePreset } from '@/lib/api';
import { cn } from '@/lib/utils';

interface CurrentSettings {
  model: string;
  language: string;
  temperature: number;
  exaggeration: number;
  cfg_weight: number;
  speed: number;
  voice_id?: string;
}

interface PresetSelectorProps {
  currentSettings: CurrentSettings;
  onApplyPreset: (preset: Preset) => void;
  onPresetSaved?: () => void;
}

export function PresetSelector({
  currentSettings,
  onApplyPreset,
  onPresetSaved,
}: PresetSelectorProps) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPresets();
  }, []);

  const loadPresets = async () => {
    try {
      const data = await getPresets();
      setPresets(data);
    } catch (error) {
      console.error('Error loading presets:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyPreset = (preset: Preset) => {
    onApplyPreset(preset);
    setIsOpen(false);
  };

  const handleSavePreset = async () => {
    if (!newPresetName.trim()) return;

    setIsSaving(true);
    try {
      await createPreset({
        name: newPresetName.trim(),
        description: 'Custom preset',
        model: currentSettings.model,
        language: currentSettings.language,
        temperature: currentSettings.temperature,
        exaggeration: currentSettings.exaggeration,
        cfg_weight: currentSettings.cfg_weight,
        speed: currentSettings.speed,
        voice_id: currentSettings.voice_id,
      });
      await loadPresets();
      setNewPresetName('');
      setShowSaveForm(false);
      onPresetSaved?.();
    } catch (error) {
      console.error('Error saving preset:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePreset = async (presetId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this preset?')) return;

    try {
      await deletePreset(presetId);
      await loadPresets();
    } catch (error) {
      console.error('Error deleting preset:', error);
    }
  };

  const defaultPresets = presets.filter((p) => p.is_default);
  const userPresets = presets.filter((p) => !p.is_default);
  const isEmpty = !loading && defaultPresets.length === 0 && userPresets.length === 0;

  return (
    <div className="space-y-2">
      <label className="label">Presets</label>

      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            'w-full px-4 py-3 text-left rounded-xl flex items-center justify-between transition-all',
            'glass glass-hover focus-ring'
          )}
        >
          <span className="flex items-center gap-2 text-foreground">
            <Bookmark className="w-4 h-4 text-foreground-muted" />
            {loading ? 'Loading presets...' : 'Select preset'}
          </span>
          <ChevronDown
            className={cn(
              'w-4 h-4 text-foreground-muted transition-transform',
              isOpen && 'rotate-180'
            )}
          />
        </button>

        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setIsOpen(false)}
            />

            <div className="absolute z-20 w-full mt-2 glass-card max-h-80 overflow-y-auto">
              {loading && (
                <div className="px-4 py-3 text-sm text-foreground-muted">Loading presets...</div>
              )}

              {!loading && (
                <>
                  {defaultPresets.length > 0 && (
                    <>
                      <div className="px-4 py-2 text-xs font-medium text-foreground-muted bg-white/5 border-b border-glass-border">
                        Default presets
                      </div>
                      {defaultPresets.map((preset) => (
                        <div
                          key={preset.id}
                          className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors"
                          onClick={() => handleApplyPreset(preset)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Star className="w-3 h-3 text-amber-400 fill-amber-400 flex-shrink-0" />
                              <span className="font-medium text-sm text-foreground">{preset.name}</span>
                            </div>
                            <p className="text-xs text-foreground-muted truncate mt-0.5">
                              {preset.description}
                            </p>
                          </div>
                          <div className="text-xs text-foreground-muted ml-2 flex-shrink-0">
                            T:{preset.temperature} E:{preset.exaggeration}
                          </div>
                        </div>
                      ))}
                    </>
                  )}

                  {userPresets.length > 0 && (
                    <>
                      <div className="px-4 py-2 text-xs font-medium text-foreground-muted bg-white/5 border-b border-t border-glass-border">
                        Your presets
                      </div>
                      {userPresets.map((preset) => (
                        <div
                          key={preset.id}
                          className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors group"
                          onClick={() => handleApplyPreset(preset)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm text-foreground">{preset.name}</div>
                            {preset.description && (
                              <p className="text-xs text-foreground-muted truncate">
                                {preset.description}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-foreground-muted">
                              T:{preset.temperature} E:{preset.exaggeration}
                            </span>
                            <button
                              onClick={(e) => handleDeletePreset(preset.id, e)}
                              className="p-1 text-foreground-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </>
                  )}

                  {isEmpty && (
                    <div className="px-4 py-3 text-sm text-foreground-muted">
                      No presets yet. Save your current settings to get started.
                    </div>
                  )}

                  <div className="border-t border-glass-border">
                    {showSaveForm ? (
                      <div className="p-4 space-y-3">
                        <input
                          type="text"
                          value={newPresetName}
                          onChange={(e) => setNewPresetName(e.target.value)}
                          placeholder="Preset name"
                          className="input w-full"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSavePreset();
                            if (e.key === 'Escape') {
                              setShowSaveForm(false);
                              setNewPresetName('');
                            }
                          }}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={handleSavePreset}
                            disabled={!newPresetName.trim() || isSaving}
                            className="btn btn-primary flex-1 text-sm"
                          >
                            {isSaving ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            onClick={() => {
                              setShowSaveForm(false);
                              setNewPresetName('');
                            }}
                            className="btn btn-secondary text-sm"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowSaveForm(true);
                        }}
                        className="w-full px-4 py-3 text-sm text-left flex items-center gap-2 text-emerald-300 hover:bg-white/5"
                      >
                        <BookmarkPlus className="w-4 h-4" />
                        Save current preset
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>

      <p className="text-xs text-foreground-muted">
        Apply a preset or save your current settings for quick recall.
      </p>
    </div>
  );
}
