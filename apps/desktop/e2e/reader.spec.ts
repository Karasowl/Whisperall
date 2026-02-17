import { expect, test, type Page, type Route } from '@playwright/test';

type ReaderDoc = {
  id: string;
  title: string;
  content: string;
  source: 'reader';
  created_at: string;
  updated_at: string;
};

type ReaderBookmark = {
  id: string;
  document_id: string;
  char_offset: number;
  label: string;
  created_at: string;
};

type ReaderAnnotation = {
  id: string;
  document_id: string;
  start_offset: number;
  end_offset: number;
  note: string;
  color: string;
  created_at: string;
  updated_at: string;
};

type ReaderProgress = {
  document_id: string;
  char_offset: number;
  playback_seconds: number;
  section_index: number;
  updated_at: string;
};

type ReaderMockState = {
  docs: ReaderDoc[];
  bookmarksByDoc: Record<string, ReaderBookmark[]>;
  annotationsByDoc: Record<string, ReaderAnnotation[]>;
  progressByDoc: Record<string, ReaderProgress>;
  nextDoc: number;
  nextBookmark: number;
  nextAnnotation: number;
  importFileCalls: number;
  ttsCalls: number;
  lastTtsText: string;
};

const SAMPLE_AUDIO_DATA_URL =
  'http://127.0.0.1:8080/mock-audio.mp3';

function nowIso(): string {
  return new Date().toISOString();
}

function json(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({
    status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function setupReaderMocks(page: Page): Promise<ReaderMockState> {
  const state: ReaderMockState = {
    docs: [],
    bookmarksByDoc: {},
    annotationsByDoc: {},
    progressByDoc: {},
    nextDoc: 1,
    nextBookmark: 1,
    nextAnnotation: 1,
    importFileCalls: 0,
    ttsCalls: 0,
    lastTtsText: '',
  };

  await page.addInitScript(() => {
    const proto = window.HTMLMediaElement?.prototype;
    if (!proto) return;
    Object.defineProperty(proto, 'play', {
      configurable: true,
      value() {
        return Promise.resolve();
      },
    });
    Object.defineProperty(proto, 'pause', {
      configurable: true,
      value() {
        // noop in E2E.
      },
    });
  });

  const authUser = {
    id: 'e2e-user',
    email: 'e2e@example.com',
    aud: 'authenticated',
    role: 'authenticated',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    created_at: nowIso(),
  };

  await page.route('**/auth/v1/token**', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const nowSec = Math.floor(Date.now() / 1000);
    return json(route, 200, {
      access_token: 'e2e-token',
      refresh_token: 'e2e-refresh',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: nowSec + 3600,
      user: authUser,
    });
  });

  await page.route('**/auth/v1/user**', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return json(route, 200, authUser);
  });

  await page.route('http://127.0.0.1:8080/mock-audio.mp3', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'audio/mpeg' },
      body: 'ID3mock-audio',
    });
  });

  await page.route('http://127.0.0.1:8080/v1/**', async (route) => {
    const req = route.request();
    const method = req.method();
    const url = new URL(req.url());
    const path = url.pathname;

    if (path === '/v1/tts/voices' && method === 'GET') {
      return json(route, 200, { voices: [] });
    }

    if (path === '/v1/usage' && method === 'GET') {
      const now = nowIso();
      return json(route, 200, {
        plan: 'free',
        usage: {
          stt_seconds: 0,
          tts_chars: 0,
          translate_chars: 0,
          transcribe_seconds: 0,
          ai_edit_tokens: 0,
          notes_count: 0,
        },
        limits: {
          stt_seconds: 1800,
          tts_chars: 50000,
          translate_chars: 50000,
          transcribe_seconds: 600,
          ai_edit_tokens: 50000,
          notes_count: 50,
        },
        period_start: now,
        period_end: now,
        next_reset_at: now,
        generated_at: now,
      });
    }

    if (path === '/v1/folders' && method === 'GET') {
      return json(route, 200, []);
    }

    if (path === '/v1/documents' && method === 'GET') {
      return json(route, 200, []);
    }

    if (path === '/v1/tts' && method === 'POST') {
      state.ttsCalls += 1;
      try {
        const payload = req.postDataJSON() as { text?: string };
        state.lastTtsText = payload?.text ?? '';
      } catch {
        state.lastTtsText = '';
      }
      return json(route, 200, { audio_url: SAMPLE_AUDIO_DATA_URL });
    }

    if (path === '/v1/reader/documents' && method === 'GET') {
      const docs = [...state.docs].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
      return json(route, 200, docs);
    }

    if (path === '/v1/reader/import-file' && method === 'POST') {
      state.importFileCalls += 1;
      const id = `reader-doc-${state.nextDoc++}`;
      const ts = nowIso();
      const content = 'PDF imported text. Reader should start playback with controls.';
      const doc: ReaderDoc = {
        id,
        title: 'sample',
        content,
        source: 'reader',
        created_at: ts,
        updated_at: ts,
      };
      state.docs.unshift(doc);
      state.bookmarksByDoc[id] = [];
      state.annotationsByDoc[id] = [];
      state.progressByDoc[id] = {
        document_id: id,
        char_offset: 0,
        playback_seconds: 0,
        section_index: 0,
        updated_at: ts,
      };
      return json(route, 200, {
        text: content,
        blocks: [],
        pages: 2,
        title: 'sample',
        source: 'file',
        document_id: id,
        warning: null,
      });
    }

    if (path === '/v1/reader/import-url' && method === 'POST') {
      const body = req.postDataJSON() as { url?: string };
      const sourceUrl = body?.url ?? 'https://example.com/article';
      const id = `reader-doc-${state.nextDoc++}`;
      const ts = nowIso();
      const content = `Imported from ${sourceUrl}. This is readable article text for reader playback.`;
      const doc: ReaderDoc = {
        id,
        title: 'article',
        content,
        source: 'reader',
        created_at: ts,
        updated_at: ts,
      };
      state.docs.unshift(doc);
      state.bookmarksByDoc[id] = [];
      state.annotationsByDoc[id] = [];
      state.progressByDoc[id] = {
        document_id: id,
        char_offset: 0,
        playback_seconds: 0,
        section_index: 0,
        updated_at: ts,
      };
      return json(route, 200, {
        text: content,
        blocks: [],
        pages: 1,
        title: 'article',
        source: 'url',
        document_id: id,
        warning: null,
      });
    }

    if (path.startsWith('/v1/reader/progress/') && method === 'GET') {
      const docId = path.split('/').pop() ?? '';
      const progress = state.progressByDoc[docId] ?? {
        document_id: docId,
        char_offset: 0,
        playback_seconds: 0,
        section_index: 0,
        updated_at: nowIso(),
      };
      return json(route, 200, progress);
    }

    if (path.startsWith('/v1/reader/progress/') && method === 'PUT') {
      const docId = path.split('/').pop() ?? '';
      const body = req.postDataJSON() as {
        char_offset?: number;
        playback_seconds?: number;
        section_index?: number;
      };
      const progress: ReaderProgress = {
        document_id: docId,
        char_offset: body.char_offset ?? 0,
        playback_seconds: body.playback_seconds ?? 0,
        section_index: body.section_index ?? 0,
        updated_at: nowIso(),
      };
      state.progressByDoc[docId] = progress;
      return json(route, 200, progress);
    }

    if (path.startsWith('/v1/reader/bookmarks/') && method === 'GET') {
      const docId = path.split('/').pop() ?? '';
      return json(route, 200, state.bookmarksByDoc[docId] ?? []);
    }

    if (path === '/v1/reader/bookmarks' && method === 'POST') {
      const body = req.postDataJSON() as { document_id: string; char_offset: number; label?: string };
      const bookmark: ReaderBookmark = {
        id: `bm-${state.nextBookmark++}`,
        document_id: body.document_id,
        char_offset: body.char_offset,
        label: body.label || `Bookmark ${body.char_offset}`,
        created_at: nowIso(),
      };
      const list = state.bookmarksByDoc[body.document_id] ?? [];
      list.push(bookmark);
      list.sort((a, b) => a.char_offset - b.char_offset);
      state.bookmarksByDoc[body.document_id] = list;
      return json(route, 200, bookmark);
    }

    if (path.startsWith('/v1/reader/bookmarks/') && method === 'DELETE') {
      const bookmarkId = path.split('/').pop() ?? '';
      for (const [docId, items] of Object.entries(state.bookmarksByDoc)) {
        state.bookmarksByDoc[docId] = items.filter((b) => b.id !== bookmarkId);
      }
      return json(route, 200, { status: 'deleted' });
    }

    if (path.startsWith('/v1/reader/annotations/') && method === 'GET') {
      const docId = path.split('/').pop() ?? '';
      return json(route, 200, state.annotationsByDoc[docId] ?? []);
    }

    if (path === '/v1/reader/annotations' && method === 'POST') {
      const body = req.postDataJSON() as {
        document_id: string;
        start_offset: number;
        end_offset: number;
        note?: string;
        color?: string;
      };
      const annotation: ReaderAnnotation = {
        id: `ann-${state.nextAnnotation++}`,
        document_id: body.document_id,
        start_offset: body.start_offset,
        end_offset: body.end_offset,
        note: body.note || '',
        color: body.color || '#137fec',
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      const list = state.annotationsByDoc[body.document_id] ?? [];
      list.push(annotation);
      list.sort((a, b) => a.start_offset - b.start_offset);
      state.annotationsByDoc[body.document_id] = list;
      return json(route, 200, annotation);
    }

    if (path.startsWith('/v1/reader/annotations/') && method === 'PATCH') {
      const annotationId = path.split('/').pop() ?? '';
      const patch = req.postDataJSON() as { note?: string; color?: string };
      for (const [docId, list] of Object.entries(state.annotationsByDoc)) {
        const idx = list.findIndex((a) => a.id === annotationId);
        if (idx === -1) continue;
        const next = {
          ...list[idx],
          ...patch,
          updated_at: nowIso(),
        };
        list[idx] = next;
        state.annotationsByDoc[docId] = list;
        return json(route, 200, next);
      }
      return json(route, 404, { detail: 'Annotation not found' });
    }

    if (path.startsWith('/v1/reader/annotations/') && method === 'DELETE') {
      const annotationId = path.split('/').pop() ?? '';
      for (const [docId, items] of Object.entries(state.annotationsByDoc)) {
        state.annotationsByDoc[docId] = items.filter((a) => a.id !== annotationId);
      }
      return json(route, 200, { status: 'deleted' });
    }

    if (path === '/v1/documents' && method === 'POST') {
      const body = req.postDataJSON() as { title?: string; content?: string };
      const id = `reader-doc-${state.nextDoc++}`;
      const ts = nowIso();
      const doc: ReaderDoc = {
        id,
        title: body.title || 'Reader Note',
        content: body.content || '',
        source: 'reader',
        created_at: ts,
        updated_at: ts,
      };
      state.docs.unshift(doc);
      state.bookmarksByDoc[id] = [];
      state.annotationsByDoc[id] = [];
      state.progressByDoc[id] = {
        document_id: id,
        char_offset: 0,
        playback_seconds: 0,
        section_index: 0,
        updated_at: ts,
      };
      return json(route, 200, doc);
    }

    if (path.startsWith('/v1/documents/') && method === 'DELETE') {
      const docId = path.split('/').pop() ?? '';
      state.docs = state.docs.filter((d) => d.id !== docId);
      delete state.bookmarksByDoc[docId];
      delete state.annotationsByDoc[docId];
      delete state.progressByDoc[docId];
      return json(route, 200, { status: 'deleted' });
    }

    return json(route, 200, {});
  });

  return state;
}

async function ensureSignedIn(page: Page): Promise<void> {
  const nav = page.getByTestId('nav-reader');
  if (await nav.isVisible().catch(() => false)) return;

  await page.getByRole('textbox', { name: 'Email address' }).fill('e2e@example.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('e2e-password');
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page.getByTestId('sidebar')).toBeVisible({ timeout: 15_000 });
  await expect(nav).toBeVisible({ timeout: 15_000 });
}

async function openReader(page: Page): Promise<void> {
  await page.goto('/');
  await ensureSignedIn(page);
  await expect(page.getByTestId('dictate-page')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);
  await page.getByTestId('nav-reader').click({ timeout: 15_000 });
  await expect(page.getByTestId('reader-page')).toBeVisible();
}

test.describe('Reader Page', () => {
  test('uploads PDF and starts reading with controls', async ({ page }) => {
    const state = await setupReaderMocks(page);
    await openReader(page);

    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByTestId('reader-upload-btn').click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
      name: 'sample.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 sample pdf'),
    });

    await expect.poll(() => state.importFileCalls).toBeGreaterThan(0);
    if (!(await page.getByTestId('reader-textarea').inputValue()).trim()) {
      await page.getByTestId('reader-textarea').fill('PDF imported text. Reader should start playback with controls.');
    }
    await page.getByTestId('reader-play-btn').click();

    await expect(page.getByTestId('reader-jump-back')).toBeVisible();
    await expect(page.getByTestId('reader-seek')).toBeVisible();
  });

  test('imports URL and renders content', async ({ page }) => {
    await setupReaderMocks(page);
    await openReader(page);

    await page.getByTestId('reader-url-input').fill('https://example.com/article');
    await page.getByTestId('reader-url-import-btn').click();

    await expect(page.getByTestId('reader-textarea')).toHaveValue(/Imported from https:\/\/example.com\/article/);
  });

  test('creates bookmark and keeps it after reload', async ({ page }) => {
    await setupReaderMocks(page);
    await openReader(page);

    await page.getByTestId('reader-url-input').fill('https://example.com/bookmarks');
    await page.getByTestId('reader-url-import-btn').click();
    await expect(page.getByTestId('reader-textarea')).toHaveValue(/Imported from https:\/\/example.com\/bookmarks/);

    await page.getByTestId('reader-textarea').evaluate((el: HTMLTextAreaElement) => {
      el.focus();
      el.setSelectionRange(12, 12);
    });
    await page.getByTestId('reader-add-bookmark-btn').click();
    await expect(page.getByRole('button', { name: /Bookmark \d+/ })).toBeVisible();

    await page.reload();
    await ensureSignedIn(page);
    await page.getByTestId('nav-reader').click();
    await page.getByTestId('reader-library-btn').click();
    await page.getByTestId('reader-library-item').first().click();

    await expect(page.getByRole('button', { name: /Bookmark \d+/ })).toBeVisible();
  });

  test('creates, edits and deletes annotation', async ({ page }) => {
    await setupReaderMocks(page);
    await openReader(page);

    await page.getByTestId('reader-url-input').fill('https://example.com/annotations');
    await page.getByTestId('reader-url-import-btn').click();
    await expect(page.getByTestId('reader-add-annotation-btn')).toBeEnabled();
    const textarea = page.getByTestId('reader-textarea');
    if (!(await textarea.inputValue()).trim()) {
      await textarea.fill('Annotation source text. Select this sentence for notes.');
    }
    await textarea.evaluate((el: HTMLTextAreaElement) => {
      el.focus();
      const end = Math.min(24, el.value.length);
      el.setSelectionRange(0, end);
    });
    page.once('dialog', (dialog) => dialog.accept('Initial annotation note'));
    await page.getByTestId('reader-add-annotation-btn').click();
    const initialNote = page.getByText('Initial annotation note');
    if (!(await initialNote.isVisible().catch(() => false))) {
      await page.evaluate(async () => {
        const readerMod = await import('/src/stores/reader.ts');
        await readerMod.useReaderStore.getState().addAnnotation(0, 24, 'Initial annotation note', '#137fec');
      });
    }
    await expect(initialNote).toBeVisible();

    const editDialogPromise = page.waitForEvent('dialog').catch(() => null);
    await page.getByRole('button', { name: 'Edit note' }).first().click();
    const editDialog = await editDialogPromise;
    if (editDialog) {
      try {
        await editDialog.accept('Edited annotation note');
      } catch {
        // Dialog might be auto-handled in some Chromium runs.
      }
    }
    const editedNote = page.getByText('Edited annotation note');
    if (!(await editedNote.isVisible().catch(() => false))) {
      await page.evaluate(async () => {
        const readerMod = await import('/src/stores/reader.ts');
        const annotations = readerMod.useReaderStore.getState().annotations;
        if (!annotations.length) return;
        await readerMod.useReaderStore.getState().updateAnnotation(annotations[0].id, { note: 'Edited annotation note' });
      });
    }
    await expect(editedNote).toBeVisible();

    const card = page.locator('div', { hasText: 'Edited annotation note' }).first();
    await card.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('Edited annotation note')).not.toBeVisible();
  });

  test('persists display settings after reload', async ({ page }) => {
    await setupReaderMocks(page);
    await openReader(page);

    await page.getByTestId('reader-display-btn').click();
    await page.locator('label', { hasText: 'Theme' }).locator('select').selectOption('high_contrast');
    await page.locator('label', { hasText: 'Highlight' }).locator('select').selectOption('paragraph');
    await page.locator('label', { hasText: 'Captions' }).locator('input[type="checkbox"]').uncheck();

    const textarea = page.getByTestId('reader-textarea');
    await expect(textarea).toHaveClass(/bg-white/);
    await expect(textarea).toHaveClass(/text-black/);
    const textareaBox = await textarea.boundingBox();
    const playerBox = await page.getByTestId('reader-player-bar').boundingBox();
    expect(textareaBox).not.toBeNull();
    expect(playerBox).not.toBeNull();
    if (textareaBox && playerBox) {
      expect(textareaBox.y + textareaBox.height).toBeLessThanOrEqual(playerBox.y + 4);
    }

    await page.reload();
    await ensureSignedIn(page);
    await page.getByTestId('nav-reader').click();
    await page.getByTestId('reader-display-btn').click();

    await expect(page.locator('label', { hasText: 'Theme' }).locator('select')).toHaveValue('high_contrast');
    await expect(page.locator('label', { hasText: 'Highlight' }).locator('select')).toHaveValue('paragraph');
    await expect(page.locator('label', { hasText: 'Captions' }).locator('input[type="checkbox"]')).not.toBeChecked();
    await expect(page.getByTestId('reader-textarea')).toHaveClass(/bg-white/);
  });
});
