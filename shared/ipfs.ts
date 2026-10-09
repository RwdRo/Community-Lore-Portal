/** Normalize CID references without turning the asset endpoint into a URL proxy. */
export function normalizeIpfsReference(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 512) return null;
  let value = input.trim();
  if (/^https:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      if (!url.pathname.startsWith('/ipfs/')) return null;
      value = url.pathname.slice(6);
    } catch { return null; }
  } else {
    value = value.replace(/^ipfs:\/\/(?:ipfs\/)?/i, '').replace(/^\/ipfs\//, '');
  }
  const [cid, ...parts] = value.split('/');
  if (!/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,119})$/.test(cid)) return null;
  if (parts.some(part => !/^[a-zA-Z0-9_.-]+$/.test(part) || part === '.' || part === '..')) return null;
  return [cid, ...parts].join('/');
}

export function assetImageUrl(reference: string): string {
  const ipfs = normalizeIpfsReference(reference);
  if (ipfs) return '/api/assets/ipfs?ref=' + encodeURIComponent(ipfs);
  try {
    const url = new URL(reference);
    if (url.protocol === 'https:' && !url.username && !url.password) return url.href;
  } catch { /* Missing or unsupported asset references use a local fallback. */ }
  return '/asset-unavailable.svg';
}
