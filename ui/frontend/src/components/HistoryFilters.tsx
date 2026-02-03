'use client';

import { useState, useEffect } from 'react';
import {
  Filter,
  Search,
  Star,
  Calendar,
  X,
  ChevronDown,
  Mic,
  MessageSquare,
  FileAudio,
  Globe,
  Sparkles,
  Music,
  Video,
  Wand2,
  Languages,
  AudioLines,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { HistoryFilter, HistoryModuleInfo, getHistoryModules } from '@/lib/api';

interface HistoryFiltersProps {
  filters: HistoryFilter;
  onFiltersChange: (filters: HistoryFilter) => void;
  className?: string;
}

// Module display configuration
const MODULE_CONFIG: Record<string, { label: string; icon: typeof Mic; color: string }> = {
  'tts': { label: 'Text to Speech', icon: MessageSquare, color: 'text-emerald-400' },
  'stt': { label: 'Speech to Text', icon: Mic, color: 'text-blue-400' },
  'transcribe': { label: 'Transcription', icon: FileAudio, color: 'text-purple-400' },
  'loopback': { label: 'Live Transcription', icon: Mic, color: 'text-red-400' },
  'voice-changer': { label: 'Voice Changer', icon: Wand2, color: 'text-pink-400' },
  'voice-isolator': { label: 'Voice Isolator', icon: AudioLines, color: 'text-cyan-400' },
  'dubbing': { label: 'Dubbing', icon: Globe, color: 'text-amber-400' },
  'sfx': { label: 'Sound Effects', icon: Sparkles, color: 'text-orange-400' },
  'music': { label: 'Music Generation', icon: Music, color: 'text-rose-400' },
  'stems': { label: 'Stem Separation', icon: AudioLines, color: 'text-indigo-400' },
  'ai-edit': { label: 'AI Edit', icon: Wand2, color: 'text-violet-400' },
  'translate': { label: 'Translation', icon: Languages, color: 'text-teal-400' },
  'reader': { label: 'Reader', icon: FileAudio, color: 'text-sky-400' },
};

export function HistoryFilters({ filters, onFiltersChange, className }: HistoryFiltersProps) {
  const [modules, setModules] = useState<HistoryModuleInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModuleDropdown, setShowModuleDropdown] = useState(false);
  const [showDateDropdown, setShowDateDropdown] = useState(false);
  const [searchValue, setSearchValue] = useState(filters.search || '');

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchValue !== filters.search) {
        onFiltersChange({ ...filters, search: searchValue || undefined });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchValue]);

  // Load modules
  useEffect(() => {
    async function loadModules() {
      try {
        const data = await getHistoryModules();
        setModules(data.modules);
      } catch (err) {
        console.error('Failed to load history modules:', err);
      } finally {
        setLoading(false);
      }
    }
    loadModules();
  }, []);

  const handleModuleChange = (module: string | undefined) => {
    onFiltersChange({ ...filters, module, offset: 0 });
    setShowModuleDropdown(false);
  };

  const handleFavoriteToggle = () => {
    onFiltersChange({
      ...filters,
      favorite: filters.favorite ? undefined : true,
      offset: 0,
    });
  };

  const handleDatePreset = (preset: string) => {
    const now = new Date();
    let dateFrom: string | undefined;

    switch (preset) {
      case 'today':
        dateFrom = new Date(now.setHours(0, 0, 0, 0)).toISOString();
        break;
      case 'week':
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        dateFrom = weekAgo.toISOString();
        break;
      case 'month':
        const monthAgo = new Date(now);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        dateFrom = monthAgo.toISOString();
        break;
      case 'all':
      default:
        dateFrom = undefined;
    }

    onFiltersChange({ ...filters, dateFrom, dateTo: undefined, offset: 0 });
    setShowDateDropdown(false);
  };

  const clearAllFilters = () => {
    setSearchValue('');
    onFiltersChange({
      limit: filters.limit,
      offset: 0,
    });
  };

  const hasActiveFilters = !!(
    filters.module ||
    filters.provider ||
    filters.favorite ||
    filters.dateFrom ||
    filters.search
  );

  const getDateLabel = () => {
    if (!filters.dateFrom) return 'All Time';
    const from = new Date(filters.dateFrom);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 1) return 'Today';
    if (diffDays <= 7) return 'This Week';
    if (diffDays <= 31) return 'This Month';
    return from.toLocaleDateString();
  };

  const selectedModuleConfig = filters.module ? MODULE_CONFIG[filters.module] : null;

  return (
    <div className={cn('space-y-4', className)}>
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
        <input
          type="text"
          placeholder="Search history..."
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          className="input w-full pl-10 pr-10"
        />
        {searchValue && (
          <button
            onClick={() => setSearchValue('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-surface-2 rounded"
          >
            <X className="w-4 h-4 text-foreground-muted" />
          </button>
        )}
      </div>

      {/* Filter Pills */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Module Filter */}
        <div className="relative">
          <button
            onClick={() => {
              setShowModuleDropdown(!showModuleDropdown);
              setShowDateDropdown(false);
            }}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-colors',
              filters.module
                ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/30'
                : 'bg-surface-2 hover:bg-surface-3 text-foreground-secondary'
            )}
          >
            {selectedModuleConfig ? (
              <>
                <selectedModuleConfig.icon className={cn('w-4 h-4', selectedModuleConfig.color)} />
                {selectedModuleConfig.label}
              </>
            ) : (
              <>
                <Filter className="w-4 h-4" />
                All Modules
              </>
            )}
            <ChevronDown className="w-3 h-3" />
          </button>

          {showModuleDropdown && (
            <div className="absolute top-full left-0 mt-1 w-56 bg-surface-1 border border-border rounded-lg shadow-xl z-50 py-1 max-h-80 overflow-y-auto">
              <button
                onClick={() => handleModuleChange(undefined)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-surface-2 transition-colors text-left',
                  !filters.module && 'bg-accent-primary/10 text-accent-primary'
                )}
              >
                <Filter className="w-4 h-4" />
                All Modules
              </button>
              <div className="border-t border-border my-1" />
              {Object.entries(MODULE_CONFIG).map(([key, config]) => {
                const moduleInfo = modules.find(m => m.module === key);
                const Icon = config.icon;
                return (
                  <button
                    key={key}
                    onClick={() => handleModuleChange(key)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-surface-2 transition-colors text-left',
                      filters.module === key && 'bg-accent-primary/10 text-accent-primary'
                    )}
                  >
                    <Icon className={cn('w-4 h-4', config.color)} />
                    <span className="flex-1">{config.label}</span>
                    {moduleInfo && (
                      <span className="text-xs text-foreground-muted">{moduleInfo.count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Date Filter */}
        <div className="relative">
          <button
            onClick={() => {
              setShowDateDropdown(!showDateDropdown);
              setShowModuleDropdown(false);
            }}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-colors',
              filters.dateFrom
                ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/30'
                : 'bg-surface-2 hover:bg-surface-3 text-foreground-secondary'
            )}
          >
            <Calendar className="w-4 h-4" />
            {getDateLabel()}
            <ChevronDown className="w-3 h-3" />
          </button>

          {showDateDropdown && (
            <div className="absolute top-full left-0 mt-1 w-40 bg-surface-1 border border-border rounded-lg shadow-xl z-50 py-1">
              {[
                { key: 'all', label: 'All Time' },
                { key: 'today', label: 'Today' },
                { key: 'week', label: 'This Week' },
                { key: 'month', label: 'This Month' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => handleDatePreset(key)}
                  className={cn(
                    'w-full px-3 py-2 text-sm text-left hover:bg-surface-2 transition-colors',
                    (key === 'all' && !filters.dateFrom) && 'bg-accent-primary/10 text-accent-primary'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Favorites Filter */}
        <button
          onClick={handleFavoriteToggle}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-colors',
            filters.favorite
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              : 'bg-surface-2 hover:bg-surface-3 text-foreground-secondary'
          )}
        >
          <Star className={cn('w-4 h-4', filters.favorite && 'fill-current')} />
          Favorites
        </button>

        {/* Clear Filters */}
        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm bg-error/10 text-error hover:bg-error/20 transition-colors"
          >
            <X className="w-4 h-4" />
            Clear
          </button>
        )}
      </div>

      {/* Click outside handler */}
      {(showModuleDropdown || showDateDropdown) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setShowModuleDropdown(false);
            setShowDateDropdown(false);
          }}
        />
      )}
    </div>
  );
}

export default HistoryFilters;
