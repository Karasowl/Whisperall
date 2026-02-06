import { useRef } from 'react';
import { useTranscriptionStore } from '../stores/transcription';

export function TranscribePage() {
  const { jobs, activeJobId, loading, error, createJob, setActiveJob } = useTranscriptionStore();
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    createJob(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div className="page">
      <h2>Transcribe</h2>

      <div
        className="dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept="audio/*,video/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <span className="material-symbols-outlined dropzone-icon">upload_file</span>
        <p>Drop audio/video file here or click to browse</p>
      </div>

      {error && <p className="error-text">{error}</p>}
      {loading && <p className="status-text">Creating job...</p>}

      {jobs.length > 0 && (
        <div className="job-list">
          <h3>Jobs</h3>
          {jobs.map((job) => (
            <div
              key={job.id}
              className={`job-card${job.id === activeJobId ? ' active' : ''}`}
              onClick={() => setActiveJob(job.id)}
            >
              <span className="job-name">{job.filename ?? job.id}</span>
              <span className={`job-status ${job.status}`}>{job.status}</span>
              <span className="job-progress">
                {job.processed_chunks}/{job.total_chunks} chunks
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
