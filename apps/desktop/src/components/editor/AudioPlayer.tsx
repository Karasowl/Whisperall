import { useState } from 'react';

const WAVEFORM_PLAYED = [30, 50, 70, 40, 80, 60, 90];
const WAVEFORM_UNPLAYED = [70, 50, 30, 60, 40, 20, 50, 80, 40, 30, 20, 40, 60, 30, 50, 20, 40, 60, 30, 50, 20, 40, 60, 30];

export function AudioPlayer() {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];

  const cycleSpeed = () => {
    const idx = speeds.indexOf(speed);
    setSpeed(speeds[(idx + 1) % speeds.length]);
  };

  return (
    <footer className="shrink-0 h-24 bg-surface-alt border-t border-edge px-8 flex items-center justify-between shadow-[0_-4px_20px_rgba(0,0,0,0.3)]" data-testid="audio-player">
      <div className="flex items-center gap-4 w-1/4">
        <button className="text-muted hover:text-text transition-colors p-2 rounded-full hover:bg-white/5">
          <span className="material-symbols-outlined text-[24px]">skip_previous</span>
        </button>
        <button className="text-muted hover:text-text transition-colors p-2 rounded-full hover:bg-white/5">
          <span className="material-symbols-outlined text-[24px]">replay_5</span>
        </button>
        <button
          onClick={() => setPlaying(!playing)}
          className="bg-primary hover:bg-blue-500 text-white rounded-full p-3 shadow-lg shadow-primary/25 transition-transform active:scale-95"
          data-testid="play-btn"
        >
          <span className="material-symbols-outlined text-[28px] fill-1">{playing ? 'pause' : 'play_arrow'}</span>
        </button>
        <button className="text-muted hover:text-text transition-colors p-2 rounded-full hover:bg-white/5">
          <span className="material-symbols-outlined text-[24px]">forward_10</span>
        </button>
      </div>

      <div className="flex flex-col flex-1 max-w-2xl gap-2 px-4">
        <div className="flex items-end justify-between h-8 gap-[2px] opacity-80">
          {WAVEFORM_PLAYED.map((h, i) => (
            <div key={`p${i}`} className="w-1 bg-primary rounded-t-sm" style={{ height: `${h}%` }} />
          ))}
          <div className="w-1 bg-text rounded-t-sm h-full shadow-[0_0_8px_rgba(255,255,255,0.5)]" />
          {WAVEFORM_UNPLAYED.map((h, i) => (
            <div key={`u${i}`} className="w-1 bg-zinc-700 rounded-t-sm" style={{ height: `${h}%` }} />
          ))}
        </div>
        <div className="flex justify-between text-xs font-medium font-mono text-muted">
          <span className="text-text">0:00</span>
          <span>0:00</span>
        </div>
      </div>

      <div className="flex items-center justify-end gap-6 w-1/4">
        <button onClick={cycleSpeed} className="text-xs font-bold text-muted hover:text-text bg-surface border border-edge rounded px-2 py-1 flex items-center gap-1 transition-colors" data-testid="speed-btn">
          {speed}x
          <span className="material-symbols-outlined text-[14px]">expand_less</span>
        </button>
        <div className="flex items-center gap-2 group">
          <button className="text-muted hover:text-text">
            <span className="material-symbols-outlined text-[20px]">volume_up</span>
          </button>
          <div className="w-20 h-1 bg-zinc-700 rounded-full cursor-pointer relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-[70%] bg-text group-hover:bg-primary transition-colors" />
          </div>
        </div>
      </div>
    </footer>
  );
}
