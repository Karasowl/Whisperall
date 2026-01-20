'use client';

import { useState, useEffect, useMemo } from 'react';
import { User, Users, Search, Volume2, Play, Pause } from 'lucide-react';
import Link from 'next/link';
import axios from 'axios';
import { cn } from '@/lib/utils';
import { TTSPresetVoice, getTTSProviderVoices } from '@/lib/api';

interface PresetVoiceSelectorProps {
  providerId: string;
  selected: string | null;
  onSelect: (voiceId: string) => void;
  language?: string;
  className?: string;
}

// Language display names
const LANGUAGE_NAMES: Record<string, string> = {
  'en-us': 'English (US)',
  'en-gb': 'English (UK)',
  'en': 'English',
  'es': 'Spanish',
  'fr': 'French',
  'de': 'German',
  'it': 'Italian',
  'pt': 'Portuguese',
  'ja': 'Japanese',
  'ko': 'Korean',
  'zh': 'Chinese',
  'hi': 'Hindi',
};

export function PresetVoiceSelector({
  providerId,
  selected,
  onSelect,
  language,
  className,
}: PresetVoiceSelectorProps) {
  const [allVoices, setAllVoices] = useState<TTSPresetVoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterGender, setFilterGender] = useState<'all' | 'male' | 'female'>('all');
  const [filterLanguage, setFilterLanguage] = useState<string>('all');
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  useEffect(() => {
    async function loadVoices() {
      try {
        setLoading(true);
        setError(null);
        const voices = await getTTSProviderVoices(providerId, language);
        setAllVoices(voices);

        // Auto-select first voice for current language if none selected
        const hasSelected = selected && voices.some(v => v.id === selected);
        if (!hasSelected && voices.length > 0) {
          if (language) {
            const langBase = language.split('-')[0];
            const matchingVoice = voices.find(v =>
              v.language === language || v.language?.startsWith(langBase)
            );
            onSelect(matchingVoice ? matchingVoice.id : voices[0].id);
          } else {
            onSelect(voices[0].id);
          }
        }
      } catch (err: unknown) {
        let message = 'Failed to load voices';
        if (axios.isAxiosError(err)) {
          message = err.response?.data?.detail || err.message || message;
        } else if (err instanceof Error) {
          message = err.message || message;
        }
        setError(message);
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    if (providerId) {
      loadVoices();
    }
  }, [providerId, language]);

  const playVoice = (voice: TTSPresetVoice) => {
    if (!voice.sample_url) return;

    if (playingVoiceId === voice.id) {
      audioElement?.pause();
      setPlayingVoiceId(null);
      return;
    }

    audioElement?.pause();
    const audio = new Audio(voice.sample_url);
    audio.onended = () => setPlayingVoiceId(null);
    audio.play().catch(() => setPlayingVoiceId(null));
    setAudioElement(audio);
    setPlayingVoiceId(voice.id);
  };

  // Get unique languages from voices
  const availableLanguages = useMemo(() => {
    const langs = new Set(allVoices.map(v => v.language).filter((lang): lang is string => Boolean(lang)));
    return Array.from(langs).sort();
  }, [allVoices]);

  useEffect(() => {
    if (filterLanguage !== 'all' && !availableLanguages.includes(filterLanguage)) {
      setFilterLanguage('all');
    }
  }, [availableLanguages, filterLanguage]);

  // Filter voices
  const filteredVoices = useMemo(() => {
    return allVoices.filter(voice => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = voice.name.toLowerCase().includes(query);
        const matchesDesc = voice.description?.toLowerCase().includes(query);
        if (!matchesName && !matchesDesc) return false;
      }

      // Gender filter
      if (filterGender !== 'all' && voice.gender !== filterGender) {
        return false;
      }

      // Language filter
      if (filterLanguage !== 'all') {
        const langBase = filterLanguage.split('-')[0];
        const voiceLangBase = voice.language?.split('-')[0];
        if (voice.language !== filterLanguage && voiceLangBase !== langBase) {
          return false;
        }
      }

      return true;
    });
  }, [allVoices, searchQuery, filterGender, filterLanguage]);

  // Group voices by language
  const groupedVoices = useMemo(() => {
    const groups: Record<string, TTSPresetVoice[]> = {};
    for (const voice of filteredVoices) {
      const lang = voice.language || 'other';
      if (!groups[lang]) groups[lang] = [];
      groups[lang].push(voice);
    }
    return groups;
  }, [filteredVoices]);

  if (loading) {
    return (
      <div className={cn('space-y-4', className)}>
        <label className="label flex items-center gap-2">
          <Volume2 className="w-4 h-4" />
          Select Voice
        </label>
        <div className="grid grid-cols-2 gap-2">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="glass p-3 rounded-lg animate-pulse h-16" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('space-y-4', className)}>
        <label className="label flex items-center gap-2">
          <Volume2 className="w-4 h-4" />
          Select Voice
        </label>
        <div className="glass p-4 rounded-xl border-red-500/30 bg-red-500/10 space-y-2">
          <p className="text-red-300 text-sm">{error}</p>
          {error.toLowerCase().includes('api key') && (
            <Link href="/settings?tab=api-keys" className="text-xs text-amber-300 underline">
              Open Settings to add API key
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      <label className="label flex items-center gap-2">
        <Volume2 className="w-4 h-4" />
        Select Voice
        <span className="text-slate-400 font-normal">
          ({filteredVoices.length} voices)
        </span>
      </label>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[150px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search voices..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input pl-9 py-2 text-sm w-full"
          />
        </div>

        {/* Gender filter */}
        <div className="flex gap-1">
          {(['all', 'female', 'male'] as const).map(gender => (
            <button
              key={gender}
              onClick={() => setFilterGender(gender)}
              className={cn(
                'px-3 py-2 rounded-lg text-xs font-medium transition-all',
                filterGender === gender
                  ? 'bg-gradient-to-r from-emerald-400 to-amber-400 text-white'
                  : 'glass glass-hover text-slate-400'
              )}
            >
              {gender === 'all' ? 'All' : gender === 'female' ? 'Female' : 'Male'}
            </button>
          ))}
        </div>

        {/* Language filter */}
        <select
          value={filterLanguage}
          onChange={(e) => setFilterLanguage(e.target.value)}
          className="input py-2 text-sm min-w-[120px]"
        >
          <option value="all">All Languages</option>
          {availableLanguages.map(lang => (
            <option key={lang} value={lang}>
              {LANGUAGE_NAMES[lang] || lang}
            </option>
          ))}
        </select>
      </div>

      {/* Voice list */}
      <div className="max-h-[400px] overflow-y-auto space-y-4 pr-2">
        {Object.entries(groupedVoices).map(([lang, voices]) => (
          <div key={lang}>
            <h4 className="text-xs font-medium text-slate-400 mb-2 sticky top-0 bg-background/80 backdrop-blur-sm py-1">
              {LANGUAGE_NAMES[lang] || lang}
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {voices.map(voice => {
                const isSelected = selected === voice.id;
                const isFemale = voice.gender === 'female';
                const isPlaying = playingVoiceId === voice.id;

                return (
                  <div
                    key={voice.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelect(voice.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect(voice.id);
                      }
                    }}
                    className={cn(
                      'p-3 rounded-lg text-left transition-all cursor-pointer',
                      'border-2 flex items-center gap-2',
                      isSelected
                        ? 'border-emerald-400 bg-emerald-500/20'
                        : 'glass glass-hover border-transparent'
                    )}
                  >
                    {voice.sample_url && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          playVoice(voice);
                        }}
                        className={cn(
                          'p-2 rounded-lg transition-all',
                          isPlaying
                            ? 'btn-primary text-white'
                            : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300'
                        )}
                        aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
                      >
                        {isPlaying ? (
                          <Pause className="w-4 h-4" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                      </button>
                    )}
                    <div className={cn(
                      'p-1.5 rounded-full',
                      isFemale ? 'bg-pink-500/20' : 'bg-blue-500/20'
                    )}>
                      {isFemale ? (
                        <User className="w-3 h-3 text-pink-400" />
                      ) : (
                        <User className="w-3 h-3 text-blue-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        'font-medium text-sm truncate',
                        isSelected ? 'text-emerald-300' : 'text-slate-100'
                      )}>
                        {voice.name}
                      </p>
                      {voice.description && (
                        <p className="text-xs text-slate-400 truncate">
                          {voice.description}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {filteredVoices.length === 0 && (
          <div className="text-center py-8 text-slate-400">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No voices match your filters</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default PresetVoiceSelector;
