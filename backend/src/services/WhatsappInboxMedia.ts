import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { downloadContentFromMessage, type AnyMessageContent, type proto } from '@whiskeysockets/baileys';

export const inboxMediaLimit = 8 * 1024 * 1024;
export const inboxMediaFields = { kind: true, name: true, mimeType: true, size: true } as const;

export class InboxMediaError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

function safeName(name: string) {
  return name.replace(/[\\/\u0000-\u001f\u007f]/g, '_').trim().slice(0, 150) || 'Arquivo';
}

function mediaType(data: Buffer) {
  if (data.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return { kind: 'IMAGE', mimeType: 'image/jpeg' };
  if (data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { kind: 'IMAGE', mimeType: 'image/png' };
  if (data.subarray(4, 8).toString() === 'ftyp') return { kind: 'VIDEO', mimeType: 'video/mp4' };
  if (data.subarray(0, 4).toString() === 'OggS') return { kind: 'AUDIO', mimeType: 'audio/ogg' };
  if (data.subarray(0, 3).toString() === 'ID3' || (data[0] === 255 && ((data[1] ?? 0) & 0xe0) === 0xe0)) return { kind: 'AUDIO', mimeType: 'audio/mpeg' };
  return { kind: 'DOCUMENT', mimeType: 'application/octet-stream' };
}

let activeEncoders = 0;
async function encodeVoice(source: Buffer) {
  const format = source.subarray(0, 4).toString() === 'OggS' ? 'ogg'
    : source.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) ? 'webm'
    : source.subarray(4, 8).toString() === 'ftyp' ? 'mp4' : null;
  if (!format) throw new InboxMediaError('Formato de gravação incompatível.');
  if (activeEncoders >= 2) throw new InboxMediaError('O serviço de áudio está ocupado. Tente novamente.', 503);
  activeEncoders++;
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      const encoder = spawn(process.env.FFMPEG_PATH || 'ffmpeg', [
        '-v', 'error', '-protocol_whitelist', 'pipe', '-f', format, '-i', 'pipe:0',
        '-map', '0:a:0', '-vn', '-t', '120', '-ac', '1', '-ar', '48000',
        '-c:a', 'libopus', '-b:a', '32k', '-f', 'ogg', 'pipe:1',
      ], { stdio: ['pipe', 'pipe', 'ignore'] });
      const chunks: Buffer[] = [];
      let size = 0;
      const timer = setTimeout(() => encoder.kill('SIGKILL'), 12000);
      encoder.stdout.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > inboxMediaLimit) encoder.kill('SIGKILL');
        else chunks.push(chunk);
      });
      encoder.stdin.on('error', () => {});
      encoder.once('error', () => {
        clearTimeout(timer);
        reject(new InboxMediaError('A conversão de áudio está indisponível.', 503));
      });
      encoder.once('close', code => {
        clearTimeout(timer);
        if (code === 0 && size > 200 && size <= inboxMediaLimit) resolve(Buffer.concat(chunks));
        else reject(new InboxMediaError('Não foi possível preparar a gravação. Grave novamente.'));
      });
      encoder.stdin.end(source);
    });
  } finally { activeEncoders--; }
}

export async function prepareInboxUpload(file: Express.Multer.File, voice: boolean) {
  if (file.size < 1) throw new InboxMediaError('O arquivo está vazio.');
  const name = voice ? 'Mensagem de voz.ogg' : safeName(file.originalname);
  const data = voice ? await encodeVoice(file.buffer) : file.buffer;
  const detected = mediaType(data);
  const type = !voice && detected.kind === 'VIDEO' && /^audio\//.test(file.mimetype)
    ? { kind: 'AUDIO', mimeType: 'audio/mp4' } : detected;
  const digest = createHash('sha256').update(JSON.stringify([name, voice])).update(file.buffer).digest('hex');
  return { ...type, ...(voice ? { kind: 'VOICE' } : {}), name, data, size: data.length, digest };
}

export function outgoingInboxMedia(media: { kind: string; name: string; mimeType: string; data: Buffer }, text: string): AnyMessageContent {
  const { data, kind, mimeType, name } = media;
  if (kind === 'VOICE' || kind === 'AUDIO') {
    return { audio: data, mimetype: kind === 'VOICE' ? 'audio/ogg; codecs=opus' : mimeType, ptt: kind === 'VOICE' };
  }
  const caption = text ? { caption: text } : {};
  if (kind === 'IMAGE') return { image: data, mimetype: mimeType, ...caption };
  if (kind === 'VIDEO') return { video: data, mimetype: mimeType, ...caption };
  return { document: data, mimetype: mimeType, fileName: name, ...caption };
}

export function observedInboxMedia(message: proto.IMessage | null | undefined) {
  if (message?.imageMessage) return { type: 'image' as const, source: message.imageMessage, name: 'Imagem', kind: 'IMAGE', text: message.imageMessage.caption || '' };
  if (message?.videoMessage) return { type: 'video' as const, source: message.videoMessage, name: 'Vídeo', kind: 'VIDEO', text: message.videoMessage.caption || '' };
  if (message?.audioMessage) return { type: 'audio' as const, source: message.audioMessage, name: message.audioMessage.ptt ? 'Mensagem de voz' : 'Áudio', kind: message.audioMessage.ptt ? 'VOICE' : 'AUDIO', text: '' };
  if (message?.documentMessage) return { type: 'document' as const, source: message.documentMessage, name: safeName(message.documentMessage.fileName || 'Documento'), kind: 'DOCUMENT', text: message.documentMessage.caption || '' };
  return null;
}

let activeDownloads = 0;
export async function downloadInboxMedia(media: NonNullable<ReturnType<typeof observedInboxMedia>>) {
  if (activeDownloads >= 4) return null;
  activeDownloads++;
  try { return await fetchInboxMedia(media); }
  finally { activeDownloads--; }
}

async function fetchInboxMedia(media: NonNullable<ReturnType<typeof observedInboxMedia>>) {
  const { source, type, name, kind } = media;
  const size = Number(source.fileLength);
  if (!source.mediaKey?.length || source.fileSha256?.length !== 32 || !Number.isSafeInteger(size) || size < 1 || size > inboxMediaLimit) return null;
  // Limita o download ao CDN oficial e bloqueia redirecionamento para outro host.
  const url = source.url?.startsWith('https://mmg.whatsapp.net/') ? source.url : undefined;
  const directPath = source.directPath;
  if (!url && (!directPath || !directPath.startsWith('/') || /^\/[\/\\]/.test(directPath))) return null;
  const stream = await downloadContentFromMessage({
    mediaKey: Buffer.from(source.mediaKey),
    ...(url ? { url } : { directPath: directPath! }),
  }, type, { options: { maxRedirects: 0, timeout: 12000, signal: AbortSignal.timeout(15000) } });
  let bytes = 0;
  const chunks: Buffer[] = [];
  try {
    for await (const chunk of stream) {
      const buffer = Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > inboxMediaLimit) return null;
      chunks.push(buffer);
    }
  } finally { stream.destroy(); }
  const data = Buffer.concat(chunks);
  const digest = createHash('sha256').update(data).digest();
  if (bytes !== size || !digest.equals(Buffer.from(source.fileSha256))) return null;
  let detected = mediaType(data);
  if ((kind === 'AUDIO' || kind === 'VOICE') && detected.kind === 'VIDEO') detected = { kind: 'AUDIO', mimeType: 'audio/mp4' };
  if (kind === 'VOICE' && detected.kind === 'AUDIO') detected.kind = 'VOICE';
  if (kind === 'DOCUMENT' || detected.kind !== kind) detected = { kind: 'DOCUMENT', mimeType: 'application/octet-stream' };
  return { ...detected, name, data, size: bytes, digest: digest.toString('hex') };
}
