/** Real-time speech-to-text via WebSocket (backend proxies to Deepgram). */

export type StreamEvent =
  | { type: 'transcript'; text: string; isFinal: boolean; speechFinal: boolean }
  | { type: 'utterance_end' }
  | { type: 'error'; message: string }
  | { type: 'open' }
  | { type: 'close' };

export type DeepgramStreamOptions = {
  url: string | (() => string); // ws://localhost:8080/v1/live/stream
  onEvent: (event: StreamEvent) => void;
};

const MAX_RETRIES = Infinity; // support 10h+ sessions
const INITIAL_DELAY = 1500;
const MAX_DELAY = 30_000;

export class DeepgramStream {
  private ws: WebSocket | null = null;
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private stopped = false;
  private retries = 0;

  constructor(private opts: DeepgramStreamOptions) {}

  start(stream: MediaStream): void {
    this.stream = stream;
    this.stopped = false;
    this.retries = 0;
    this.connect();
  }

  private resolveUrl(): string {
    return typeof this.opts.url === 'function' ? this.opts.url() : this.opts.url;
  }

  private connect(): void {
    if (this.stopped || !this.stream?.active) return;

    const ws = new WebSocket(this.resolveUrl());
    this.ws = ws;

    ws.onopen = () => {
      console.log('[dg-stream] WebSocket open');
      this.retries = 0;
      this.opts.onEvent({ type: 'open' });

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus' : 'audio/webm';
      const rec = new MediaRecorder(this.stream!, { mimeType });
      this.recorder = rec;

      rec.ondataavailable = (e) => {
        if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
          ws.send(e.data);
        }
      };
      rec.start(500);
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'transcript') {
          this.opts.onEvent({
            type: 'transcript',
            text: data.text,
            isFinal: data.is_final ?? false,
            speechFinal: data.speech_final ?? false,
          });
        } else if (data.type === 'utterance_end') {
          this.opts.onEvent({ type: 'utterance_end' });
        } else if (data.type === 'error') {
          const code = String(data.code || '').toUpperCase();
          this.opts.onEvent({ type: 'error', message: data.message });
          // Don't reconnect forever on non-retryable errors (auth/plan/config).
          if (code === 'PLAN_LIMIT_EXCEEDED' || code === 'AUTH_REQUIRED' || code === 'AUTH_INVALID' || code === 'CONFIG_MISSING') {
            this.stopped = true;
            try { ws.close(); } catch { /* ignore */ }
          }
        }
      } catch { /* non-JSON message */ }
    };

    ws.onerror = () => {
      this.opts.onEvent({ type: 'error', message: 'WebSocket connection error' });
    };

    ws.onclose = (ev) => {
      console.log('[dg-stream] WebSocket closed, stopped=', this.stopped);
      // 1008 = "policy violation" (we use it for auth/plan-limit errors).
      if (ev?.code === 1008) this.stopped = true;
      if (this.recorder?.state === 'recording') this.recorder.stop();
      this.recorder = null;

      if (!this.stopped && this.stream?.active && this.retries < MAX_RETRIES) {
        this.retries++;
        const delay = Math.min(INITIAL_DELAY * 2 ** (this.retries - 1), MAX_DELAY);
        console.log(`[dg-stream] reconnecting (attempt ${this.retries}), delay=${delay}ms`);
        setTimeout(() => this.connect(), delay);
      } else {
        this.opts.onEvent({ type: 'close' });
      }
    };
  }

  stop(): void {
    this.stopped = true;
    if (this.recorder?.state === 'recording') this.recorder.stop();
    this.recorder = null;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.close();
    this.ws = null;
    this.stream = null;
  }
}
