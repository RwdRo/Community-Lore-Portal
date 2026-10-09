import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createAssetResolver } from '../server/assetResolver';
import { normalizeIpfsReference, assetImageUrl } from '../shared/ipfs';

const cid = 'QmW43vjHy2GJVhh2ygLLXQu4rUEvS1wTHssSviTiciqR14';
async function withResolver(fetcher: typeof fetch, run: (base: string) => Promise<void>) {
  const app = express();
  app.get('/asset', createAssetResolver({ gateways: ['https://one.test/ipfs/', 'https://two.test/ipfs/'], fetcher }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try { await run('http://127.0.0.1:' + (server.address() as any).port + '/asset'); }
  finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}
test('normalizes CID, IPFS URI, gateway URL, and safe file paths', () => {
  for (const ref of [cid, 'ipfs://' + cid, 'https://ipfs.io/ipfs/' + cid]) assert.equal(normalizeIpfsReference(ref), cid);
  assert.equal(normalizeIpfsReference('ipfs://' + cid + '/art.png'), cid + '/art.png');
  assert.equal(assetImageUrl(cid), '/api/assets/ipfs?ref=' + cid);
});
test('rejects traversal and arbitrary proxy destinations', () => {
  for (const ref of ['http://127.0.0.1/private', cid + '/../secret', cid + '/%2e%2e/secret', cid + '?url=x', '', {}, cid + '//image'])
    assert.equal(normalizeIpfsReference(ref), null);
  assert.equal(assetImageUrl('javascript:alert(1)'), '/asset-unavailable.svg');
});
test('gateway outage falls back, caches, and coalesces duplicate requests', async () => {
  const calls: string[] = [];
  await withResolver((async (url, init) => {
    calls.push(String(url)); assert.equal(init?.redirect, 'error');
    if (String(url).includes('one.test')) throw Error('offline');
    return new Response(new Uint8Array([137,80,78,71]), { headers: { 'Content-Type': 'image/png' } });
  }) as typeof fetch, async base => {
    const responses = await Promise.all([fetch(base + '?ref=' + cid), fetch(base + '?ref=' + cid)]);
    for (const response of responses) {
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('x-loreworks-asset'), 'resolved');
      assert.equal((await response.arrayBuffer()).byteLength, 4);
    }
    await fetch(base + '?ref=' + cid);
    assert.equal(calls.length, 2);
  });
});
test('invalid input never makes an upstream request', async () => {
  await withResolver((async () => { throw Error('must not fetch'); }) as typeof fetch, async base => {
    const response = await fetch(base + '?ref=http://localhost/secret');
    assert.equal(response.status, 400);
  });
});
test('HTML and oversized images become a cached safe fallback', async () => {
  let calls = 0;
  await withResolver((async () => {
    calls++;
    return calls === 1
      ? new Response('<script>alert(1)</script>', { headers: { 'content-type': 'text/html' } })
      : new Response('huge', { headers: { 'content-type': 'image/png', 'content-length': '99999999' } });
  }) as typeof fetch, async base => {
    const response = await fetch(base + '?ref=' + cid);
    assert.equal(response.headers.get('x-loreworks-asset'), 'unavailable');
    assert.match(await response.text(), /IMAGE UNAVAILABLE/);
    await fetch(base + '?ref=' + cid);
    assert.equal(calls, 2);
  });
});
test('stream without a content length is still size bounded', async () => {
  await withResolver((async () => new Response(new Uint8Array(5 * 1024 * 1024 + 1),
    { headers: { 'content-type': 'image/png' } })) as typeof fetch, async base => {
    const response = await fetch(base + '?ref=' + cid);
    assert.equal(response.headers.get('x-loreworks-asset'), 'unavailable');
  });
});
