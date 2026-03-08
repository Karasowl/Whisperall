import { create } from 'zustand';
import { electron } from '../lib/electron';
import { testClaudeKey } from '../lib/ai-providers';

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

function normalizeCodexError(error: string | undefined): string {
  const msg = (error || '').trim();
  if (!msg) return 'Connection failed';
  const low = msg.toLowerCase();
  if (low.includes('invalid callback') || low.includes('state mismatch')) {
    return 'La sesion de login expiro. Cierra la ventana de OpenAI y presiona "Connect OpenAI" otra vez.';
  }
  if (low.includes('authentication window closed') || low.includes('cancelled')) {
    return 'Login cancelado. Presiona "Connect OpenAI" para reintentar.';
  }
  if (low.includes('missing organization_id') || low.includes('invalid organization_id') || low.includes('/org-setup')) {
    return 'Tu cuenta necesita completar la organizacion API de OpenAI. Abre https://platform.openai.com/org-setup, termina el setup y vuelve a probar.';
  }
  if (
    low.includes('missing scopes: model.request')
    || low.includes("scope 'model.request'")
    || low.includes('cannot call api models')
  ) {
    return 'Tu login de OpenAI no tiene acceso directo a API models. Solucion recomendada: instala Codex CLI y ejecuta `npx @openai/codex login`, luego presiona Test.';
  }
  if (msg.includes('Codex CLI not available') || msg.includes('Codex exec failed') || msg.includes('ENOENT')) {
    return 'Para usar tu suscripcion de ChatGPT en la app: instala Codex CLI y ejecuta `npx @openai/codex login`, luego presiona Test.';
  }
  return msg;
}

interface ProviderAuthState {
  codexState: ConnectionState;
  codexEmail: string;
  codexError: string;
  codexLatency: number | null;
  claudeState: ConnectionState;
  claudeEmail: string;
  claudeError: string;
  claudeLatency: number | null;
  claudeAuthMode: 'oauth' | 'apikey';

  connectCodex: () => Promise<void>;
  cancelCodex: () => void;
  disconnectCodex: () => Promise<void>;
  testCodex: () => Promise<void>;
  loadCodexStatus: () => Promise<void>;

  startClaudeAuth: () => Promise<void>;
  exchangeClaudeCode: (code: string) => Promise<void>;
  disconnectClaude: () => Promise<void>;
  testClaudeOAuth: () => Promise<void>;
  testClaudeApiKey: (apiKey: string) => Promise<void>;
  loadClaudeStatus: () => Promise<void>;
  resetClaude: () => void;
}

export const useProviderAuthStore = create<ProviderAuthState>((set) => ({
  codexState: 'disconnected',
  codexEmail: '',
  codexError: '',
  codexLatency: null,
  claudeState: 'disconnected',
  claudeEmail: '',
  claudeError: '',
  claudeLatency: null,
  claudeAuthMode: 'oauth',

  connectCodex: async () => {
    set({ codexState: 'connecting', codexError: '' });
    try {
      const result = await electron?.codexAuth.start();
      if (result?.ok) {
        set({ codexState: 'connected', codexEmail: result.email || '', codexError: '' });
        // Auto-test API access — consumer OAuth may lack model.request scope
        const test = await electron?.codexAuth.test();
        if (test && !test.ok) {
          set({ codexState: 'error', codexError: normalizeCodexError(test.error), codexLatency: null });
        } else if (test?.ok) {
          set({ codexLatency: test.latency ?? null });
        }
      } else {
        set({ codexState: 'error', codexError: normalizeCodexError(result?.error || 'Connection failed') });
      }
    } catch {
      set({ codexState: 'disconnected', codexError: '' });
    }
  },

  cancelCodex: () => {
    electron?.codexAuth.cancel();
    set({ codexState: 'disconnected', codexError: '' });
  },

  disconnectCodex: async () => {
    await electron?.codexAuth.disconnect();
    set({ codexState: 'disconnected', codexEmail: '', codexError: '', codexLatency: null });
  },

  testCodex: async () => {
    const result = await electron?.codexAuth.test();
    if (result?.ok) {
      set({ codexState: 'connected', codexLatency: result.latency ?? null, codexError: '' });
    } else {
      set({ codexState: 'error', codexError: normalizeCodexError(result?.error || 'Test failed'), codexLatency: null });
    }
  },

  loadCodexStatus: async () => {
    const status = await electron?.codexAuth.status();
    if (status?.connected) {
      set({ codexState: 'connected', codexEmail: status.email });
      // Validate API access — consumer OAuth may lack model.request scope
      const test = await electron?.codexAuth.test();
      if (test && !test.ok) {
        set({ codexState: 'error', codexError: normalizeCodexError(test.error), codexLatency: null });
      } else if (test?.ok) {
        set({ codexLatency: test.latency ?? null });
      }
    } else {
      set({ codexState: 'disconnected', codexEmail: '' });
    }
  },

  // --- Claude OAuth ---

  startClaudeAuth: async () => {
    set({ claudeState: 'connecting', claudeError: '', claudeAuthMode: 'oauth' });
    await electron?.claudeAuth.start();
    // Browser opened — user will paste the code
  },

  exchangeClaudeCode: async (code: string) => {
    set({ claudeState: 'connecting', claudeError: '' });
    const result = await electron?.claudeAuth.exchange(code);
    if (result?.ok) {
      set({ claudeState: 'connected', claudeEmail: result.email || '', claudeError: '' });
    } else {
      set({ claudeState: 'error', claudeError: result?.error || 'Exchange failed' });
    }
  },

  disconnectClaude: async () => {
    await electron?.claudeAuth.disconnect();
    set({ claudeState: 'disconnected', claudeEmail: '', claudeError: '', claudeLatency: null });
  },

  testClaudeOAuth: async () => {
    const result = await electron?.claudeAuth.test();
    if (result?.ok) {
      set({ claudeState: 'connected', claudeLatency: result.latency ?? null, claudeError: '' });
    } else {
      set({ claudeState: 'error', claudeError: result?.error || 'Test failed', claudeLatency: null });
    }
  },

  testClaudeApiKey: async (apiKey: string) => {
    const start = Date.now();
    const result = await testClaudeKey(apiKey);
    const latency = Date.now() - start;
    if (result.ok) {
      set({ claudeState: 'connected', claudeLatency: latency, claudeError: '', claudeAuthMode: 'apikey' });
    } else {
      set({ claudeState: 'error', claudeError: result.error, claudeLatency: null });
    }
  },

  loadClaudeStatus: async () => {
    const status = await electron?.claudeAuth.status();
    if (status?.connected) {
      set({ claudeState: 'connected', claudeEmail: status.email, claudeAuthMode: 'oauth' });
    }
  },

  resetClaude: () => {
    set({ claudeState: 'disconnected', claudeEmail: '', claudeError: '', claudeLatency: null });
  },
}));