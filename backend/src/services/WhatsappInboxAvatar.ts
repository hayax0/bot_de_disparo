type Avatar = { data: Buffer; mimeType: 'image/jpeg' | 'image/png' | 'image/webp' };
const maxAvatarBytes = 128 * 1024;
const cache = new Map<string, { expiresAt: number; value: Promise<Avatar | null> }>();

async function downloadAvatar(address: string | undefined): Promise<Avatar | null> {
  if (!address) return null;
  const url = new URL(address);
  const host = url.hostname;
  const trustedHost = host === 'pps.whatsapp.net' || host === 'mmg.whatsapp.net'
    || /^media\.[a-z0-9-]+\.fna\.whatsapp\.net$/.test(host)
    || /^scontent[.-][a-z0-9.-]+\.fbcdn\.net$/.test(host);
  if (!trustedHost || url.protocol !== 'https:' || url.username || url.password || url.port) return null;

  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(5000) });
  if (!response.ok || !response.body || Number(response.headers.get('content-length')) > maxAvatarBytes) {
    await response.body?.cancel();
    return null;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxAvatarBytes) { await reader.cancel(); return null; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }

  const data = Buffer.concat(chunks);
  if (data.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return { data, mimeType: 'image/jpeg' };
  if (data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { data, mimeType: 'image/png' };
  if (data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP') return { data, mimeType: 'image/webp' };
  return null;
}

export async function getInboxAvatar(workspaceId: string, accountId: string, jid: string, resolve: () => Promise<string | undefined>) {
  const key = `${workspaceId}/${accountId}/${jid}`;
  const current = cache.get(key);
  const now = Date.now();
  if (current && current.expiresAt > now) return current.value;
  if (cache.size >= 128) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }

  const entry = { expiresAt: now + 5000, value: resolve().then(downloadAvatar).catch(() => null) };
  cache.set(key, entry);
  const value = await entry.value;
  entry.expiresAt = Date.now() + (value ? 5 * 60_000 : 30_000);
  return value;
}
