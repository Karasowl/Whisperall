import { useRef, useState } from 'react';
import { useT } from '../../lib/i18n';

type Props = { onFile: (file: File) => void; onUrl: (url: string) => void; stagedFileName?: string; stagedUrl?: string };

export function UploadZone({ onFile, onUrl, stagedFileName, stagedUrl }: Props) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [urlInput, setUrlInput] = useState('');
  const [tab, setTab] = useState<'file' | 'url'>('file');

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  };

  const handleUrlSubmit = () => {
    const trimmed = urlInput.trim();
    if (trimmed) { onUrl(trimmed); }
  };

  const staged = stagedFileName || stagedUrl;

  return (
    <div className="flex flex-col gap-3" data-testid="upload-zone">
      <div className="flex gap-1 bg-base rounded-lg p-1 w-fit">
        <button onClick={() => setTab('file')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${tab === 'file' ? 'bg-surface text-text' : 'text-muted hover:text-text'}`}>
          <span className="material-symbols-outlined text-[14px] align-middle mr-1">upload_file</span>{t('transcribe.upload')}
        </button>
        <button onClick={() => setTab('url')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${tab === 'url' ? 'bg-surface text-text' : 'text-muted hover:text-text'}`} data-testid="url-tab">
          <span className="material-symbols-outlined text-[14px] align-middle mr-1">link</span>{t('transcribe.pasteLink')}
        </button>
      </div>

      {tab === 'file' ? (
        <div
          className="group relative flex flex-col items-center justify-center w-full h-52 rounded-xl border-2 border-dashed border-edge bg-surface/30 hover:bg-primary/5 hover:border-primary/50 transition-all cursor-pointer overflow-hidden"
          onDragOver={(e) => e.preventDefault()} onDrop={handleDrop} onClick={() => fileRef.current?.click()}
        >
          <input ref={fileRef} type="file" accept="audio/*,video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
          <div className="relative z-10 flex flex-col items-center gap-3 text-center px-4">
            <div className="size-14 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
              <span className="material-symbols-outlined text-[28px]">cloud_upload</span>
            </div>
            {stagedFileName ? (
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[20px]">audio_file</span>
                <span className="text-sm font-semibold text-text">{stagedFileName}</span>
              </div>
            ) : (
              <>
                <h3 className="text-base font-bold text-text">{t('transcribe.upload')}</h3>
                <p className="text-xs text-muted">{t('transcribe.dragDrop')}</p>
              </>
            )}
            <div className="flex gap-2">
              {['MP3', 'WAV', 'MP4', 'WEBM', 'OGG'].map((fmt) => (
                <span key={fmt} className="px-2 py-0.5 rounded text-[10px] font-mono bg-edge text-muted">{fmt}</span>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl border-2 border-dashed border-edge bg-surface/30 p-6 h-52 justify-center">
          <div className="flex items-center gap-2 text-muted mb-2">
            <span className="material-symbols-outlined text-[20px]">link</span>
            <span className="text-sm">{t('transcribe.urlDesc')}</span>
          </div>
          <div className="flex gap-2">
            <input
              type="url" value={stagedUrl || urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
              placeholder={t('transcribe.urlPlaceholder')}
              className="flex-1 bg-base border border-edge text-text text-sm rounded-lg px-3 py-2.5 focus:ring-primary focus:border-primary placeholder:text-muted/50"
              data-testid="url-input"
            />
            <button onClick={handleUrlSubmit} className="px-4 py-2.5 bg-primary/20 text-primary rounded-lg text-sm font-medium hover:bg-primary/30 transition-colors">
              {t('transcribe.loadUrl')}
            </button>
          </div>
        </div>
      )}

      {staged && (
        <p className="text-xs text-primary flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">check_circle</span>
          {t('transcribe.readyToStart')}
        </p>
      )}
    </div>
  );
}
