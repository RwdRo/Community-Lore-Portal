import type { RequestHandler } from 'express';
import { normalizeIpfsReference } from '../shared/ipfs';

const FALLBACK = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"><rect width="320" height="320" fill="#100f10"/><text x="160" y="165" text-anchor="middle" fill="#777778" font-family="monospace" font-size="13">IMAGE UNAVAILABLE</text></svg>';
const MAX_BYTES = 5 * 1024 * 1024;
const CACHE_BYTES = 24 * 1024 * 1024;
type ImageResult = { body: Buffer; type: string; failed: boolean };

export function createAssetResolver(options: {
  gateways?: string[]; fetcher?: typeof fetch; timeoutMs?: number;
} = {}): RequestHandler {
  const gateways = (options.gateways ?? (process.env.IPFS_GATEWAYS ||
    'https://ipfs.io/ipfs/,https://dweb.link/ipfs/').split(',')).map(raw => {
    const url = new URL(raw.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
      throw new Error('IPFS gateways must be HTTPS base URLs');
    return url.href.replace(/\/?$/, '/');
  }).slice(0, 3);
  const fetcher = options.fetcher ?? fetch;
  const cache = new Map<string, { result: ImageResult; until: number }>();
  const pending = new Map<string, Promise<ImageResult>>();
  let cacheBytes = 0;
  const fallback = (): ImageResult => ({
    body: Buffer.from(FALLBACK), type: 'image/svg+xml', failed: true,
  });

  async function resolve(ref: string): Promise<ImageResult> {
    for (const gateway of gateways) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 4000);
      try {
        const response = await fetcher(gateway + ref, {
          signal: controller.signal, redirect: 'error',
          headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif' },
        });
        const type = response.headers.get('content-type')?.split(';')[0].trim() || '';
        if (!response.ok || !/^image\/(png|jpeg|webp|gif|avif)$/.test(type) ||
            Number(response.headers.get('content-length')) > MAX_BYTES || !response.body) {
          await response.body?.cancel();
          continue;
        }
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > MAX_BYTES) throw new Error('Asset too large');
            chunks.push(chunk.value);
          }
        } finally { await reader.cancel(); }
        if (size) return { body: Buffer.concat(chunks), type, failed: false };
      } catch { /* Try the next configured gateway; never expose upstream errors. */ }
      finally { clearTimeout(timeout); }
    }
    return fallback();
  }

  return async (req, res) => {
    const ref = normalizeIpfsReference(req.query.ref);
    if (!ref) { res.status(400).json({ error: 'Invalid IPFS reference' }); return; }
    let result: ImageResult;
    const cached = cache.get(ref);
    if (cached && cached.until > Date.now()) result = cached.result;
    else {
      // Bound distinct concurrent requests and memory even during upstream outages.
      if (!pending.has(ref) && pending.size >= 12) {
        res.set('Retry-After', '5').status(503).end(); return;
      }
      if (!pending.has(ref)) {
        const job = resolve(ref).then(value => {
          const previous = cache.get(ref);
          if (previous) { cacheBytes -= previous.result.body.length; cache.delete(ref); }
          while (cache.size && (cacheBytes + value.body.length > CACHE_BYTES || cache.size >= 128)) {
            const oldest = cache.keys().next().value!;
            cacheBytes -= cache.get(oldest)!.result.body.length;
            cache.delete(oldest);
          }
          cache.set(ref, { result: value, until: Date.now() + (value.failed ? 30_000 : 300_000) });
          cacheBytes += value.body.length;
          return value;
        }).finally(() => pending.delete(ref));
        pending.set(ref, job);
      }
      result = await pending.get(ref)!;
    }
    res.set({
      'Content-Type': result.type,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': result.failed ? 'public, max-age=30' : 'public, max-age=300',
      'X-Loreworks-Asset': result.failed ? 'unavailable' : 'resolved',
    }).send(result.body);
  };
}
