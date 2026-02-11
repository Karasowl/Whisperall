import { COMPETITORS } from '@/lib/constants';

const FEATURE_KEYS: { key: keyof (typeof COMPETITORS)[0]; label: string }[] = [
  { key: 'dictation', label: 'Voice Dictation' },
  { key: 'meetings', label: 'Live Meetings' },
  { key: 'transcription', label: 'File Transcription' },
  { key: 'tts', label: 'Text-to-Speech' },
  { key: 'translation', label: 'Translation' },
  { key: 'subtitles', label: 'Subtitles' },
  { key: 'overlay', label: 'Overlay Widget' },
];

function Check({ yes }: { yes: boolean }) {
  return (
    <span className={`material-symbols-outlined text-[18px] ${yes ? 'text-green-500 fill-1' : 'text-edge'}`}>
      {yes ? 'check_circle' : 'cancel'}
    </span>
  );
}

export function Comparison() {
  return (
    <section className="py-20 px-6 bg-surface-alt">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-black text-text mb-4">Why pay for 4 apps?</h2>
          <p className="text-text-secondary">WhisperAll replaces wisprflow, granola, speechify, and turboscribe.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-edge">
                <th className="text-left py-3 pr-4 text-muted font-medium">Feature</th>
                {COMPETITORS.map((c) => (
                  <th key={c.name} className={`py-3 px-3 text-center font-bold ${c.name === 'WhisperAll' ? 'text-primary' : 'text-text'}`}>
                    {c.name}
                    <div className="text-[11px] font-normal text-muted mt-0.5">{c.price}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FEATURE_KEYS.map(({ key, label }) => (
                <tr key={key} className="border-b border-edge/50">
                  <td className="py-3 pr-4 text-text-secondary font-medium">{label}</td>
                  {COMPETITORS.map((c) => (
                    <td key={c.name} className="py-3 px-3 text-center">
                      <Check yes={c[key] as boolean} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
