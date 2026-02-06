import { useDictationStore } from '../stores/dictation';
import { electron } from '../lib/electron';
import { PlanGate } from '../components/PlanGate';

export function DictatePage() {
  const { status, text, error, language, start, stop, reset, setLanguage } = useDictationStore();

  const handleToggle = () => {
    if (status === 'recording') {
      stop();
    } else {
      start();
    }
  };

  const handlePaste = () => {
    if (text) electron?.pasteText(text);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="page">
      <h2>Dictate</h2>

      <PlanGate resource="stt_seconds">
      <div className="dictate-controls">
        <select value={language} onChange={(e) => setLanguage(e.target.value)}>
          <option value="en">English</option>
          <option value="es">Spanish</option>
          <option value="fr">French</option>
          <option value="de">German</option>
          <option value="pt">Portuguese</option>
          <option value="ja">Japanese</option>
          <option value="zh">Chinese</option>
        </select>

        <button
          className={`btn-record ${status === 'recording' ? 'recording' : ''}`}
          onClick={handleToggle}
          disabled={status === 'processing'}
        >
          <span className="material-symbols-outlined">
            {status === 'recording' ? 'stop' : 'mic'}
          </span>
          {status === 'recording' ? 'Stop' : 'Record'}
        </button>

        <button className="btn-ghost" onClick={reset} disabled={status === 'recording'}>
          Clear
        </button>
      </div>

      {status === 'processing' && <p className="status-text">Processing...</p>}
      {error && <p className="error-text">{error}</p>}

      <div className="dictate-output">
        <textarea
          className="text-output"
          value={text}
          readOnly
          placeholder="Dictated text will appear here..."
          rows={12}
        />
        <div className="output-actions">
          <button className="btn-primary" onClick={handlePaste} disabled={!text}>
            <span className="material-symbols-outlined">content_paste</span>
            Paste
          </button>
          <button className="btn-ghost" onClick={handleCopy} disabled={!text}>
            <span className="material-symbols-outlined">content_copy</span>
            Copy
          </button>
        </div>
      </div>
      </PlanGate>
    </div>
  );
}
