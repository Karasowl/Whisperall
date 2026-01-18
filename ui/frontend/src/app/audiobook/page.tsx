'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, Download, Loader2, Check } from 'lucide-react';
import { ProgressBar } from '@/components/ProgressBar';
import { SelectMenu } from '@/components/SelectMenu';
import {
  parseDocument,
  generateBook,
  getJobStatus,
  getAudioUrl,
  Chapter,
  JobStatus,
} from '@/lib/api';
import { cn } from '@/lib/utils';

export default function AudiobookPage() {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [selectedChapters, setSelectedChapters] = useState<Set<number>>(new Set());

  const [model, setModel] = useState('multilingual');
  const [language, setLanguage] = useState('en');
  const [outputFormat, setOutputFormat] = useState('mp3');

  const [isLoading, setIsLoading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    setIsParsing(true);
    setError(null);

    try {
      const result = await parseDocument(file);
      setChapters(result.chapters);
      setStats(result.stats);
      setSelectedChapters(new Set(result.chapters.map((c: Chapter) => c.number)));
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to parse document');
    } finally {
      setIsParsing(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/plain': ['.txt'],
      'text/markdown': ['.md'],
      'application/pdf': ['.pdf'],
    },
    maxFiles: 1,
  });

  const toggleChapter = (num: number) => {
    const newSelected = new Set(selectedChapters);
    if (newSelected.has(num)) {
      newSelected.delete(num);
    } else {
      newSelected.add(num);
    }
    setSelectedChapters(newSelected);
  };

  const handleGenerate = async () => {
    if (selectedChapters.size === 0) {
      setError('Select at least one chapter');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const selectedChapterData = chapters.filter((c) => selectedChapters.has(c.number));

      const result = await generateBook({
        chapters: selectedChapterData,
        model,
        language,
        output_format: outputFormat,
        temperature: 0.8,
        exaggeration: 0.5,
        cfg_weight: 0.5,
        speed: 1.0,
      });

      setJobId(result.job_id);

      const pollInterval = setInterval(async () => {
        try {
          const status = await getJobStatus(result.job_id);
          setJobStatus(status);

          if (status.status === 'completed' || status.status === 'error') {
            clearInterval(pollInterval);
            setIsLoading(false);
          }
        } catch {
          clearInterval(pollInterval);
          setIsLoading(false);
        }
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Generation failed');
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-slide-up">
      <div>
        <h1 className="text-3xl font-bold text-gradient">Audiobook Creator</h1>
        <p className="mt-2 text-foreground-muted">
          Turn documents into narrated audio with chapter detection.
        </p>
      </div>

      {error && (
        <div className="glass-card p-4 border-red-500/30 bg-red-500/10 text-red-300">
          {error}
        </div>
      )}

      {chapters.length === 0 && (
        <div
          {...getRootProps()}
          className={cn(
            'border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors',
            isDragActive ? 'border-emerald-400 bg-emerald-500/10' : 'border-white/10 hover:border-white/20'
          )}
        >
          <input {...getInputProps()} />
          {isParsing ? (
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="w-12 h-12 text-foreground-muted animate-spin" />
              <p className="text-foreground-muted">Parsing document...</p>
            </div>
          ) : (
            <>
              <Upload className="w-12 h-12 mx-auto text-foreground-muted" />
              <p className="mt-4 text-lg text-foreground-muted">
                {isDragActive ? 'Drop the file here' : 'Drag and drop a document'}
              </p>
              <p className="mt-2 text-sm text-foreground-muted">
                Supports TXT, MD, and PDF files
              </p>
            </>
          )}
        </div>
      )}

      {chapters.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-foreground">Chapters</h2>
              <div className="flex gap-3 text-sm">
                <button
                  onClick={() => setSelectedChapters(new Set(chapters.map((c) => c.number)))}
                  className="text-emerald-300 hover:text-emerald-200"
                >
                  Select all
                </button>
                <button
                  onClick={() => setSelectedChapters(new Set())}
                  className="text-foreground-muted hover:text-foreground"
                >
                  Deselect all
                </button>
              </div>
            </div>

            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
              {chapters.map((chapter) => (
                <div
                  key={chapter.number}
                  onClick={() => toggleChapter(chapter.number)}
                  className={cn(
                    'glass-card p-4 cursor-pointer transition-colors',
                    selectedChapters.has(chapter.number)
                      ? 'border-emerald-400/40'
                      : 'hover:border-white/20'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        'w-5 h-5 rounded border flex items-center justify-center',
                        selectedChapters.has(chapter.number)
                          ? 'bg-emerald-400 border-emerald-400'
                          : 'border-white/20'
                      )}
                    >
                      {selectedChapters.has(chapter.number) && (
                        <Check className="w-3 h-3 text-black" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-foreground">{chapter.title}</div>
                      <div className="text-sm text-foreground-muted mt-1 line-clamp-2">
                        {chapter.preview || chapter.content.slice(0, 150)}...
                      </div>
                      <div className="text-xs text-foreground-muted mt-2">
                        {chapter.content.split(/\s+/).length} words
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            {stats && (
              <div className="glass-card p-4">
                <h3 className="font-medium text-foreground">Document Stats</h3>
                <div className="mt-2 space-y-1 text-sm text-foreground-muted">
                  <p>{stats.num_chapters} chapters</p>
                  <p>{stats.total_words.toLocaleString()} words</p>
                  <p>~{Math.round(stats.estimated_duration_minutes)} min audio</p>
                </div>
              </div>
            )}

            <div className="glass-card p-4 space-y-4">
              <SelectMenu
                label="Model"
                value={model}
                options={[
                  { value: 'multilingual', label: 'Multilingual' },
                  { value: 'original', label: 'Original' },
                  { value: 'turbo', label: 'Turbo (Fast)' },
                ]}
                onChange={setModel}
              />

              <SelectMenu
                label="Language"
                value={language}
                options={[
                  { value: 'en', label: 'English' },
                  { value: 'es', label: 'Spanish' },
                  { value: 'fr', label: 'French' },
                  { value: 'de', label: 'German' },
                  { value: 'it', label: 'Italian' },
                  { value: 'pt', label: 'Portuguese' },
                  { value: 'zh', label: 'Chinese' },
                  { value: 'ja', label: 'Japanese' },
                  { value: 'ko', label: 'Korean' },
                ]}
                onChange={setLanguage}
                disabled={model !== 'multilingual'}
              />

              <SelectMenu
                label="Output Format"
                value={outputFormat}
                options={[
                  { value: 'mp3', label: 'MP3' },
                  { value: 'wav', label: 'WAV' },
                  { value: 'flac', label: 'FLAC' },
                ]}
                onChange={setOutputFormat}
              />

              <button
                onClick={handleGenerate}
                disabled={isLoading || selectedChapters.size === 0}
                className="btn btn-primary w-full"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <FileText className="w-5 h-5" />
                    Generate Audiobook
                  </>
                )}
              </button>

              <button
                onClick={() => {
                  setChapters([]);
                  setStats(null);
                  setJobStatus(null);
                }}
                className="btn btn-secondary w-full"
              >
                Upload Different File
              </button>
            </div>
          </div>
        </div>
      )}

      {jobStatus && jobStatus.status === 'processing' && (
        <ProgressBar
          progress={jobStatus.progress}
          status={`Processing chapter ${jobStatus.current_chapter} of ${jobStatus.total_chapters}`}
        />
      )}

      {jobStatus && jobStatus.status === 'completed' && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-emerald-300">Audiobook complete</h2>
          <div className="space-y-2">
            {jobStatus.outputs.map((output) => (
              <div key={output.chapter} className="glass-card p-4 flex items-center justify-between">
                <div>
                  <div className="font-medium text-foreground">{output.title}</div>
                  <div className="text-sm text-foreground-muted">{output.filename}</div>
                </div>
                <a
                  href={getAudioUrl(output.url)}
                  download
                  className="btn btn-primary"
                >
                  <Download className="w-4 h-4" />
                  Download
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {jobStatus && jobStatus.status === 'error' && (
        <div className="glass-card p-4 border-red-500/30 bg-red-500/10 text-red-300">
          Error: {jobStatus.error}
        </div>
      )}
    </div>
  );
}
