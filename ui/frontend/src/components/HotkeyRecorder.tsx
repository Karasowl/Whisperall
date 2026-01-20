'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

// Reserved/forbidden shortcuts that should not be allowed (only truly system-level ones)
const RESERVED_SHORTCUTS = new Set([
  // Essential clipboard operations (always intercepted by OS)
  'Ctrl+C', 'Ctrl+X', 'Ctrl+V', 'Ctrl+A',
  // System shortcuts that can't be overridden
  'Alt+F4', // Close window (Windows)
  'Ctrl+Shift+Esc', // Task manager (Windows)
  'Alt+Tab', 'Alt+Shift+Tab', // Window switching
  'Ctrl+Alt+Del', // System
  // Mac equivalents
  'Meta+C', 'Meta+X', 'Meta+V', 'Meta+A',
  'Meta+Q', 'Meta+W', 'Meta+Tab',
]);

// Shortcuts that work but may conflict with common apps - show warning
const CONFLICTING_SHORTCUTS: Record<string, string> = {
  'Ctrl+Shift+P': 'VS Code command palette',
  'Ctrl+Shift+I': 'Browser DevTools',
  'Ctrl+Shift+J': 'Browser DevTools',
  'Ctrl+Shift+C': 'Browser DevTools inspector',
  'Ctrl+P': 'Print dialog',
  'Ctrl+S': 'Save (many apps)',
  'Ctrl+Z': 'Undo (many apps)',
  'Ctrl+Y': 'Redo (many apps)',
  'Ctrl+F': 'Find (many apps)',
  'Ctrl+N': 'New window (many apps)',
  'Ctrl+T': 'New tab (browsers)',
  'Ctrl+W': 'Close tab (browsers)',
  'F11': 'Fullscreen (browsers)',
  'F12': 'DevTools (browsers)',
};

// Keys that should be ignored when pressed alone
const MODIFIER_KEYS = new Set([
  'Control', 'Shift', 'Alt', 'Meta',
  'ControlLeft', 'ControlRight',
  'ShiftLeft', 'ShiftRight',
  'AltLeft', 'AltRight',
  'MetaLeft', 'MetaRight',
]);

// Special key name mappings for display
const KEY_DISPLAY_NAMES: Record<string, string> = {
  'ArrowUp': 'Up',
  'ArrowDown': 'Down',
  'ArrowLeft': 'Left',
  'ArrowRight': 'Right',
  'Escape': 'Esc',
  ' ': 'Space',
  'Backspace': 'Backspace',
  'Delete': 'Del',
  'Insert': 'Ins',
  'PageUp': 'PgUp',
  'PageDown': 'PgDn',
};

interface HotkeyRecorderProps {
  value: string;
  onChange: (hotkey: string) => void;
  onSave?: () => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function HotkeyRecorder({
  value,
  onChange,
  onSave,
  placeholder = 'Click to record...',
  className,
  disabled = false,
}: HotkeyRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [currentModifiers, setCurrentModifiers] = useState<string[]>([]);
  const inputRef = useRef<HTMLDivElement>(null);

  // Check for conflicts with the current value
  const currentConflict = value ? CONFLICTING_SHORTCUTS[value] : null;

  // Format key event into hotkey string
  const formatHotkey = useCallback((e: KeyboardEvent): string | null => {
    const modifiers: string[] = [];

    if (e.ctrlKey) modifiers.push('Ctrl');
    if (e.altKey) modifiers.push('Alt');
    if (e.shiftKey) modifiers.push('Shift');
    if (e.metaKey) modifiers.push('Meta');

    // Skip if only modifier keys are pressed
    if (MODIFIER_KEYS.has(e.code) || MODIFIER_KEYS.has(e.key)) {
      // Update current modifiers display
      setCurrentModifiers(modifiers);
      return null;
    }

    // Get the main key - use e.code for reliable detection
    // When Ctrl is held, e.key returns control characters instead of letters
    let key = '';
    const code = e.code;

    if (code.startsWith('Key')) {
      // Letter keys: KeyA -> A
      key = code.slice(3);
    } else if (code.startsWith('Digit')) {
      // Number keys: Digit1 -> 1
      key = code.slice(5);
    } else if (code.startsWith('Numpad')) {
      // Numpad keys: Numpad1 -> Num1
      key = 'Num' + code.slice(6);
    } else if (code.startsWith('F') && /^F\d+$/.test(code)) {
      // Function keys: F1 -> F1
      key = code;
    } else if (KEY_DISPLAY_NAMES[e.key]) {
      // Special keys with display names
      key = KEY_DISPLAY_NAMES[e.key];
    } else if (code === 'Space') {
      key = 'Space';
    } else if (code === 'Backspace') {
      key = 'Backspace';
    } else if (code === 'Delete') {
      key = 'Del';
    } else if (code === 'Enter') {
      key = 'Enter';
    } else if (code === 'Tab') {
      key = 'Tab';
    } else if (code === 'Escape') {
      // Escape cancels recording, don't capture it
      return null;
    } else if (code.startsWith('Arrow')) {
      key = code.slice(5); // ArrowUp -> Up
    } else {
      // Fallback: use the key if it's printable, otherwise use code
      key = e.key.length === 1 ? e.key.toUpperCase() : code;
    }

    if (!key) return null;

    // Build the hotkey string
    const parts = [...modifiers, key];
    return parts.join('+');
  }, []);

  // Handle keydown during recording
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isRecording) return;

    e.preventDefault();
    e.stopPropagation();

    // Escape cancels recording
    if (e.code === 'Escape' || e.key === 'Escape') {
      setIsRecording(false);
      setCurrentModifiers([]);
      setError(null);
      return;
    }

    const hotkey = formatHotkey(e);

    if (!hotkey) {
      // Only modifiers pressed, show them
      return;
    }

    // Check if at least one modifier is required (except for F1-F12)
    const hasModifier = e.ctrlKey || e.altKey || e.shiftKey || e.metaKey;
    const isFunctionKey = e.key.match(/^F([1-9]|1[0-2])$/);

    if (!hasModifier && !isFunctionKey) {
      setError('Must include Ctrl, Alt, or Shift modifier');
      return;
    }

    // Check if it's a reserved shortcut
    if (RESERVED_SHORTCUTS.has(hotkey)) {
      setError(`"${hotkey}" is reserved by the system and cannot be used`);
      return;
    }

    // Check for conflicting shortcuts (allow but warn)
    const conflict = CONFLICTING_SHORTCUTS[hotkey];
    if (conflict) {
      setWarning(`May conflict with: ${conflict}`);
    } else {
      setWarning(null);
    }

    // Valid hotkey - update and exit recording mode
    setError(null);
    setCurrentModifiers([]);
    setIsRecording(false);
    onChange(hotkey);
  }, [isRecording, formatHotkey, onChange]);

  // Handle keyup to clear modifiers display
  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    if (!isRecording) return;

    const modifiers: string[] = [];
    if (e.ctrlKey) modifiers.push('Ctrl');
    if (e.altKey) modifiers.push('Alt');
    if (e.shiftKey) modifiers.push('Shift');
    if (e.metaKey) modifiers.push('Meta');

    setCurrentModifiers(modifiers);
  }, [isRecording]);

  // Click outside to cancel recording
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (inputRef.current && !inputRef.current.contains(e.target as Node)) {
      setIsRecording(false);
      setCurrentModifiers([]);
      setError(null);
    }
  }, []);

  // Setup event listeners
  useEffect(() => {
    if (isRecording) {
      window.addEventListener('keydown', handleKeyDown, true);
      window.addEventListener('keyup', handleKeyUp, true);
      document.addEventListener('mousedown', handleClickOutside);

      return () => {
        window.removeEventListener('keydown', handleKeyDown, true);
        window.removeEventListener('keyup', handleKeyUp, true);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isRecording, handleKeyDown, handleKeyUp, handleClickOutside]);

  // Start recording
  const startRecording = () => {
    if (disabled) return;
    setIsRecording(true);
    setError(null);
    setCurrentModifiers([]);
  };

  // Cancel recording
  const cancelRecording = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRecording(false);
    setCurrentModifiers([]);
    setError(null);
  };

  // Clear current value
  const clearValue = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setError(null);
  };

  // Display value
  const displayValue = isRecording
    ? currentModifiers.length > 0
      ? `${currentModifiers.join('+')}+...`
      : 'Press keys...'
    : value || placeholder;

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-center gap-2">
        <div
          ref={inputRef}
          onClick={startRecording}
          className={cn(
            'input w-48 font-mono text-sm cursor-pointer flex items-center justify-between',
            'transition-all duration-200',
            isRecording && 'ring-2 ring-amber-500 bg-amber-500/10',
            disabled && 'opacity-50 cursor-not-allowed',
            error && 'ring-2 ring-red-500 bg-red-500/10'
          )}
          tabIndex={0}
        >
          <span className={cn(
            !value && !isRecording && 'text-slate-400',
            isRecording && 'text-amber-300 animate-pulse'
          )}>
            {displayValue}
          </span>

          {isRecording ? (
            <button
              onClick={cancelRecording}
              className="text-xs text-slate-400 hover:text-slate-100 px-1"
              title="Cancel"
            >
              Esc
            </button>
          ) : value ? (
            <button
              onClick={clearValue}
              className="text-xs text-slate-400 hover:text-red-400 px-1"
              title="Clear"
            >
              ×
            </button>
          ) : null}
        </div>

        {onSave && !isRecording && (
          <button
            className="btn btn-secondary text-sm"
            onClick={onSave}
            disabled={disabled || !value}
          >
            Save
          </button>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      {!error && (warning || currentConflict) && (
        <p className="text-xs text-amber-400">
          {warning || `May conflict with: ${currentConflict}`}
        </p>
      )}

      {isRecording && (
        <p className="text-xs text-slate-400">
          Press a key combination (Ctrl/Alt/Shift + key). Press Esc or click outside to cancel.
        </p>
      )}
    </div>
  );
}

// Predefined list of commonly used and safe hotkeys for suggestions
export const SUGGESTED_HOTKEYS = [
  'Alt+1', 'Alt+2', 'Alt+3', 'Alt+4', 'Alt+5',
  'Alt+Q', 'Alt+W', 'Alt+E', 'Alt+R', 'Alt+T',
  'Alt+A', 'Alt+S', 'Alt+D', 'Alt+F', 'Alt+G',
  'Alt+Z', 'Alt+X', 'Alt+C', 'Alt+V', 'Alt+B',
  'Ctrl+Alt+1', 'Ctrl+Alt+2', 'Ctrl+Alt+3',
  'Ctrl+Alt+Q', 'Ctrl+Alt+W', 'Ctrl+Alt+E',
  'Ctrl+Shift+1', 'Ctrl+Shift+2', 'Ctrl+Shift+3',
  'F1', 'F2', 'F3', 'F4', 'F6', 'F7', 'F8', 'F9', 'F10',
];
