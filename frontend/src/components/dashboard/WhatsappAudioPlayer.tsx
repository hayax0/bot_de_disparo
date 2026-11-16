'use client';

import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Pause, Play } from 'lucide-react';
import { api } from '@/lib/api';

export type AudioSpeed = 1 | 1.5 | 2;
const speeds: AudioSpeed[] = [1, 1.5, 2];
const barCount = 34;
const emptyWaveform = Array<number>(barCount).fill(0.12);
let playingAudio: HTMLAudioElement | null = null;

function formatTime(seconds: number) {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

async function readWaveform(blob: Blob) {
  const context = new AudioContext();
  try {
    const audio = await context.decodeAudioData(await blob.arrayBuffer());
    const sample = audio.getChannelData(0);
    const size = Math.max(1, Math.ceil(sample.length / barCount));
    const values = emptyWaveform.map((_, index) => {
      const start = index * size;
      const end = Math.min(start + size, sample.length);
      let squared = 0;
      for (let i = start; i < end; i++) {
        const value = sample[i] ?? 0;
        squared += value * value;
      }
      return Math.sqrt(squared / Math.max(1, end - start));
    });
    const peak = Math.max(...values, 0.015);
    return { bars: values.map(value => Math.max(0.14, Math.sqrt(value / peak))), duration: audio.duration };
  } finally { void context.close().catch(() => {}); }
}

export function WhatsappAudioPlayer({ source, speed, onSpeed, label }: {
  source: Blob | string; speed: AudioSpeed; onSpeed: (speed: AudioSpeed) => void; label: string;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const request = useRef<AbortController | null>(null);
  const objectUrl = useRef<string | null>(null);
  const [waveform, setWaveform] = useState(emptyWaveform);
  const [duration, setDuration] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const node = audio.current;
    return () => {
      request.current?.abort();
      node?.pause();
      if (playingAudio === node) playingAudio = null;
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = null;
    };
  }, []);

  useEffect(() => { if (audio.current) audio.current.playbackRate = speed; }, [speed]);

  async function togglePlayback() {
    const node = audio.current;
    if (!node || loading) return;
    if (!node.paused) { node.pause(); return; }

    setError('');
    if (!objectUrl.current) {
      const controller = new AbortController();
      request.current = controller;
      setLoading(true);
      try {
        const blob = typeof source === 'string'
          ? (await api.get<Blob>(source, { responseType: 'blob', signal: controller.signal })).data
          : source;
        if (controller.signal.aborted) return;
        objectUrl.current = URL.createObjectURL(blob);
        node.src = objectUrl.current;
        void readWaveform(blob).then(result => {
          if (controller.signal.aborted) return;
          setWaveform(result.bars);
          setDuration(current => current || result.duration);
        }).catch(() => {});
      } catch {
        if (!controller.signal.aborted) setError('Não foi possível carregar o áudio.');
        return;
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    node.playbackRate = speed;
    try { await node.play(); }
    catch { if (audio.current === node) setError('Não foi possível reproduzir. Toque em play para tentar novamente.'); }
  }

  const progress = duration ? elapsed / duration : 0;

  return <div role="group" aria-label={label} onContextMenu={event => event.preventDefault()} className="w-[min(13.25rem,100%)] sm:w-60">
    <audio ref={audio} hidden preload="none" onLoadedMetadata={event => {
      const seconds = event.currentTarget.duration;
      if (Number.isFinite(seconds)) setDuration(seconds);
    }} onTimeUpdate={event => setElapsed(event.currentTarget.currentTime)} onPlay={event => {
      const node = event.currentTarget;
      if (playingAudio !== node) playingAudio?.pause();
      playingAudio = node;
      setPlaying(true);
    }} onPause={() => setPlaying(false)} onEnded={event => {
      event.currentTarget.currentTime = 0;
      setElapsed(0);
      setPlaying(false);
    }} />
    <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
      <button type="button" aria-label={playing ? 'Pausar áudio' : 'Reproduzir áudio'} disabled={loading} onClick={() => void togglePlayback()} className="flex size-9 shrink-0 items-center justify-center rounded-full text-[var(--studio-ink)] transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-[var(--studio-accent)] disabled:opacity-60">
        {loading ? <LoaderCircle size={19} className="animate-spin" /> : playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="relative flex h-7 items-center gap-[2px] rounded focus-within:outline-2 focus-within:outline-[var(--studio-accent)]">
          {waveform.map((height, index) => <span key={index} aria-hidden="true" className={`min-w-[1px] flex-1 rounded-full ${progress > index / barCount ? 'bg-[var(--studio-accent)]' : 'bg-[var(--studio-muted)]/55'}`} style={{ height: `${height * 100}%` }} />)}
          {duration > 0 && <span aria-hidden="true" style={{ left: `${progress * 100}%` }} className="pointer-events-none absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--studio-accent)]" />}
          <input type="range" aria-label="Progresso do áudio" aria-valuetext={formatTime(elapsed)} min={0} max={duration || 1} step={0.05} value={elapsed} disabled={!duration} onChange={event => {
            const next = Number(event.target.value);
            if (audio.current) audio.current.currentTime = next;
            setElapsed(next);
          }} className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-default" />
        </div>
        <span className="block text-[10px] tabular-nums text-[var(--studio-muted)]">{duration ? formatTime(playing || elapsed > 0 ? elapsed : duration) : 'Áudio'}</span>
      </div>
      <button type="button" aria-label={`Velocidade atual ${String(speed).replace('.', ',')}×. Alterar velocidade`} onClick={() => onSpeed(speeds[(speeds.indexOf(speed) + 1) % speeds.length])} className="min-w-10 shrink-0 rounded-full bg-black/25 px-2 py-1 text-center text-[11px] font-semibold tabular-nums text-[var(--studio-ink)] hover:bg-black/40 focus-visible:outline-2 focus-visible:outline-[var(--studio-accent)]">{String(speed).replace('.', ',')}×</button>
    </div>
    {error && <p role="status" className="mt-1 text-xs text-amber-300">{error}</p>}
  </div>;
}
