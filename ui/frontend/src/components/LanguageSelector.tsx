'use client';

import { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Star, ChevronDown, Globe } from 'lucide-react';
import { Language } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useDropdownPosition } from '@/lib/useDropdownPosition';

interface LanguageSelectorProps {
  languages: Language[];
  selected: string;
  onSelect: (code: string) => void;
  disabled?: boolean;
}

const FAVORITES_KEY = 'chatterbox_favorite_languages';

export function LanguageSelector({ languages, selected, onSelect, disabled }: LanguageSelectorProps) {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const dropdownStyle = useDropdownPosition(isOpen && !disabled, buttonRef);
  const portalRoot = typeof document !== 'undefined' ? document.body : null;

  // Load favorites from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(FAVORITES_KEY);
    if (stored) {
      try {
        setFavorites(JSON.parse(stored));
      } catch {
        setFavorites([]);
      }
    } else {
      // Default favorites
      setFavorites(['en', 'es']);
    }
  }, []);

  // Save favorites to localStorage
  const saveFavorites = (newFavorites: string[]) => {
    setFavorites(newFavorites);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(newFavorites));
  };

  const toggleFavorite = (code: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (favorites.includes(code)) {
      saveFavorites(favorites.filter(f => f !== code));
    } else {
      saveFavorites([...favorites, code]);
    }
  };

  // Sort languages: favorites first, then alphabetically
  const sortedLanguages = [...languages].sort((a, b) => {
    const aFav = favorites.includes(a.code);
    const bFav = favorites.includes(b.code);
    if (aFav && !bFav) return -1;
    if (!aFav && bFav) return 1;
    return a.name.localeCompare(b.name);
  });

  const selectedLang = languages.find(l => l.code === selected);
  const favoriteLanguages = sortedLanguages.filter(l => favorites.includes(l.code));
  const otherLanguages = sortedLanguages.filter(l => !favorites.includes(l.code));
  const dropdown = isOpen && !disabled ? (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={() => setIsOpen(false)}
      />

      <div
        className="z-50 dropdown-content max-h-72 overflow-y-auto animate-fade-in custom-scrollbar"
        style={dropdownStyle}
      >
        {/* Favorites section */}
        {favoriteLanguages.length > 0 && (
          <>
            <div className="px-4 py-2 text-xs font-medium text-foreground-muted bg-white/5 border-b border-white/5">
              Favorites
            </div>
            {favoriteLanguages.map((lang) => (
              <div
                key={lang.code}
                className={cn(
                  "flex items-center justify-between px-4 py-3 cursor-pointer transition-colors border-b border-white/5 last:border-0",
                  selected === lang.code
                    ? "bg-accent-primary/20 text-accent-primary"
                    : "hover:bg-accent-primary/10 text-foreground"
                )}
                onClick={() => {
                  onSelect(lang.code);
                  setIsOpen(false);
                }}
              >
                <span className={cn(selected === lang.code && "font-medium")}>
                  {lang.name} ({lang.code})
                </span>
                <button
                  onClick={(e) => toggleFavorite(lang.code, e)}
                  className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <Star className="w-4 h-4 text-warning fill-warning" />
                </button>
              </div>
            ))}
          </>
        )}

        {/* Other languages */}
        {otherLanguages.length > 0 && (
          <>
            <div className="px-4 py-2 text-xs font-medium text-foreground-muted bg-white/5 border-b border-t border-white/5">
              All Languages
            </div>
            {otherLanguages.map((lang) => (
              <div
                key={lang.code}
                className={cn(
                  "flex items-center justify-between px-4 py-3 cursor-pointer transition-colors border-b border-white/5 last:border-0",
                  selected === lang.code
                    ? "bg-accent-primary/20 text-accent-primary"
                    : "hover:bg-accent-primary/10 text-foreground"
                )}
                onClick={() => {
                  onSelect(lang.code);
                  setIsOpen(false);
                }}
              >
                <span className={selected === lang.code ? "font-medium" : ""}>
                  {lang.name} ({lang.code})
                </span>
                <button
                  onClick={(e) => toggleFavorite(lang.code, e)}
                  className="p-1.5 hover:bg-white/10 rounded-lg opacity-40 hover:opacity-100 transition-all"
                >
                  <Star className="w-4 h-4 text-foreground-muted" />
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </>
  ) : null;

  return (
    <div className="space-y-3">
      <label className="label">Language</label>

      <div className="relative">
        <button
          type="button"
          ref={buttonRef}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          className={cn(
            "w-full px-4 py-3 text-left rounded-xl flex items-center justify-between transition-all",
            disabled
              ? "card opacity-50 cursor-not-allowed border border-glass-border"
              : "card-interactive hover:bg-surface-2"
          )}
        >
          <span className="flex items-center gap-3">
            <div className={cn(
              "p-2 rounded-lg",
              disabled ? "bg-white/5" : "bg-accent-primary/10"
            )}>
              <Globe className={cn(
                "w-4 h-4",
                disabled ? "text-foreground-muted" : "text-accent-primary"
              )} />
            </div>
            <span className="text-foreground">
              {selectedLang ? `${selectedLang.name} (${selectedLang.code})` : 'Select language'}
            </span>
            {favorites.includes(selected) && (
              <Star className="w-4 h-4 text-warning fill-warning" />
            )}
          </span>
          <ChevronDown className={cn(
            "w-5 h-5 transition-transform text-foreground-muted",
            isOpen && "rotate-180"
          )} />
        </button>

        {portalRoot ? createPortal(dropdown, portalRoot) : dropdown}
      </div>

      {disabled && (
        <p className="text-xs text-foreground-muted">Language selection only available for Multilingual model</p>
      )}
    </div>
  );
}
