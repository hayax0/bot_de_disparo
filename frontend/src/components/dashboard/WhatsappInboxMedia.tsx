'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, FileText, Play, Square, X } from 'lucide-react';
import { api } from '@/lib/api';
import { WhatsappAudioPlayer, type AudioSpeed } from './WhatsappAudioPlayer';

export const MAX_ATTACHMENT_SIZE = 8 * 1024 * 1024;
const MAX_RECORDING_SECONDS = 120;

export interface InboxAttachment {
  kind: 'VOICE' | 'AUDIO' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  name: string;
  mimeType: string;
  size: number;
}

export interface InboxDraftAttachment {
  file: File;
  voice: boolean;
}

export function attachmentLabel(media: InboxAttachment) {
  if (media.kind === 'VOICE') return 'Mensagem de voz';
  if (media.kind === 'AUDIO') return 'Áudio';
  if (media.kind === 'IMAGE') return 'Imagem';
  if (media.kind === 'VIDEO') return 'Vídeo';
  return media.name;
}

function sizeLabel(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

function fileDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}

type Playback = { speed: AudioSpeed; onSpeed: (speed: AudioSpeed) => void };

export function InboxMediaBubble({ attachment, url, playback }: { attachment: InboxAttachment; url: string; playback: Playback }) {
  if (attachment.kind === 'VOICE' || attachment.kind === 'AUDIO') {
    return <WhatsappAudioPlayer source={url} label={attachmentLabel(attachment)} {...playback} />;
  }
  return <InboxFileBubble attachment={attachment} url={url} />;
}

function InboxFileBubble({ attachment, url }: { attachment: InboxAttachment; url: string }) {
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function open() {
    if (busy) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    try {
      const { data } = await api.get<Blob>(url, { responseType: 'blob', signal: controller.signal });
      if (controller.signal.aborted) return;
      if (attachment.kind === 'DOCUMENT') fileDownload(data, attachment.name);
      else setPreview(URL.createObjectURL(data));
    } catch {
      if (!controller.signal.aborted) setError('Não foi possível abrir o arquivo.');
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return <div className="space-y-2">
    {/* URLs de mídia são blobs autenticados e limitados a tipos binários reconhecidos. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {preview && attachment.kind === 'IMAGE' && <img src={preview} alt={attachment.name} className="max-h-64 max-w-full rounded-lg object-contain" />}
    {preview && attachment.kind === 'VIDEO' && <video aria-label={attachmentLabel(attachment)} controls playsInline src={preview} className="max-h-64 max-w-full rounded-lg" />}
    {(!preview || attachment.kind === 'DOCUMENT') && <button type="button" onClick={() => void open()} disabled={busy} className="flex max-w-full items-center gap-2 rounded-lg bg-black/15 px-3 py-2 text-left text-sm hover:bg-black/25 disabled:opacity-60">
      {attachment.kind === 'DOCUMENT' ? <Download size={16} className="shrink-0" /> : <Play size={16} className="shrink-0" />}
      <span className="min-w-0 break-words">{busy ? 'Carregando…' : attachment.kind === 'DOCUMENT' ? attachment.name : attachmentLabel(attachment)}
        <small className="block text-[var(--studio-muted)]">{attachment.kind === 'DOCUMENT' ? 'Baixar · ' : ''}{sizeLabel(attachment.size)}</small>
      </span>
    </button>}
    {error && <p role="alert" className="text-xs text-amber-300">{error}</p>}
  </div>;
}

export function InboxDraftMedia({ draft, disabled, onRemove, playback }: { draft: InboxDraftAttachment; disabled: boolean; onRemove: () => void; playback: Playback }) {
  if (draft.voice || draft.file.type.startsWith('audio/')) {
    return <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--studio-line)] bg-white/[0.04] p-2.5">
      <WhatsappAudioPlayer source={draft.file} label="Prévia da mensagem de voz" {...playback} />
      <button type="button" aria-label="Remover áudio da mensagem" disabled={disabled} onClick={onRemove} className="dash-btn-secondary shrink-0 p-2"><X size={15} /></button>
    </div>;
  }
  return <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-xl border border-[var(--studio-line)] bg-white/[0.04] p-2.5 text-sm">
    <FileText size={17} className="shrink-0 text-[var(--studio-accent)]" />
    <span className="min-w-0 flex-1 truncate">{draft.file.name}
      <small className="block text-[var(--studio-muted)]">{sizeLabel(draft.file.size)}</small>
    </span>
    <button type="button" aria-label="Remover anexo" disabled={disabled} onClick={onRemove} className="dash-btn-secondary p-2"><X size={15} /></button>
  </div>;
}

export function useInboxVoice(onRecorded: (draft: InboxDraftAttachment) => void, onError: (message: string) => void) {
  const recorder = useRef<MediaRecorder | null>(null);
  const microphone = useRef<MediaStream | null>(null);
  const mounted = useRef(false);
  const canceled = useRef(false);
  const [seconds, setSeconds] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      canceled.current = true;
      if (recorder.current?.state === 'recording') recorder.current.stop();
      microphone.current?.getTracks().forEach(track => track.stop());
    };
  }, []);

  const recording = seconds !== null;
  useEffect(() => {
    if (!recording) return;
    const start = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Math.min(MAX_RECORDING_SECONDS, Math.floor((Date.now() - start) / 1000));
      setSeconds(elapsed);
      if (elapsed >= MAX_RECORDING_SECONDS && recorder.current?.state === 'recording') recorder.current.stop();
    }, 250);
    return () => window.clearInterval(timer);
  }, [recording]);

  async function start() {
    if (starting || recording) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      onError('Este navegador não pode gravar áudio. Use o clipe para anexar um arquivo.');
      return;
    }
    setStarting(true);
    onError('');
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) { stream.getTracks().forEach(track => track.stop()); return; }
      microphone.current = stream;
      canceled.current = false;
      const mimeType = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type));
      const instance = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 32000 });
      const chunks: Blob[] = [];
      recorder.current = instance;
      instance.ondataavailable = ({ data }) => { if (data.size) chunks.push(data); };
      instance.onstop = () => {
        stream?.getTracks().forEach(track => track.stop());
        recorder.current = null;
        microphone.current = null;
        if (!mounted.current) return;
        setSeconds(null);
        if (canceled.current) return;
        const type = instance.mimeType || mimeType || 'audio/webm';
        const ext = type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm';
        const file = new File(chunks, `gravacao.${ext}`, { type });
        if (!file.size || file.size > MAX_ATTACHMENT_SIZE) { onError('Não foi possível usar esta gravação. Tente novamente.'); return; }
        onRecorded({ file, voice: true });
      };
      instance.onerror = () => {
        canceled.current = true;
        stream?.getTracks().forEach(track => track.stop());
        if (mounted.current) { setSeconds(null); onError('A gravação foi interrompida. Tente novamente.'); }
      };
      instance.start(250);
      setSeconds(0);
    } catch {
      stream?.getTracks().forEach(track => track.stop());
      if (mounted.current) onError('O microfone está indisponível. Confira a permissão do navegador.');
    } finally {
      if (mounted.current) setStarting(false);
    }
  }

  function stop(cancel = false) {
    canceled.current = cancel;
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }

  return { start, stop, starting, seconds };
}

export function InboxRecording({ seconds, onStop, onCancel }: { seconds: number; onStop: () => void; onCancel: () => void }) {
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return <div className="flex flex-wrap items-center gap-2 rounded-xl border border-rose-400/20 bg-rose-400/5 p-2.5 text-sm">
    <span className="flex min-w-0 flex-1 items-center gap-2"><span className="size-2 rounded-full bg-rose-400 motion-safe:animate-pulse" />Gravando <time className="tabular-nums">{time}</time></span>
    <button type="button" onClick={onCancel} className="dash-btn-secondary px-2.5 py-2 text-xs">Cancelar</button>
    <button type="button" onClick={onStop} className="dash-btn-primary inline-flex items-center gap-1.5 px-2.5 py-2 text-xs"><Square size={12} />Parar e ouvir</button>
  </div>;
}
