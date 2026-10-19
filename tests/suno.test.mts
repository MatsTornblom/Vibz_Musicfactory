import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseSunoShareLink, parseSunoLinks, parseSunoSongId, sunoSongUrl } from '../shared/suno.ts';
import { resolveShareLink } from '../netlify/functions/_lib/suno.mts';

const ID = '0a1b2c3d-4e5f-6789-abcd-ef0123456789';

test('finds the id in song links and bare ids', () => {
  assert.equal(parseSunoSongId(`https://suno.com/song/${ID}`), ID);
  assert.equal(parseSunoSongId(`https://suno.com/song/${ID}?sh=abc`), ID);
  assert.equal(parseSunoSongId(`https://app.suno.ai/song/${ID}/`), ID);
  assert.equal(parseSunoSongId(`  ${ID.toUpperCase()} `), ID);
});

test('returns null when there is no id (e.g. short share links)', () => {
  assert.equal(parseSunoSongId('https://suno.com/s/AbCdEf123'), null);
  assert.equal(parseSunoSongId('hello'), null);
  assert.equal(parseSunoSongId(''), null);
});

test('recognises exactly the share-link shape and normalises it', () => {
  assert.equal(normaliseSunoShareLink('https://suno.com/s/vLU5fuz8292IriFc'), 'https://suno.com/s/vLU5fuz8292IriFc');
  assert.equal(normaliseSunoShareLink('http://www.suno.com/s/vLU5fuz8292IriFc/?x=1'), 'https://suno.com/s/vLU5fuz8292IriFc');
  // anything else must be rejected: the server follows these
  assert.equal(normaliseSunoShareLink('https://evil.example/s/vLU5fuz8292IriFc'), null);
  assert.equal(normaliseSunoShareLink('https://suno.com.evil.example/s/vLU5fuz8292IriFc'), null);
  assert.equal(normaliseSunoShareLink('https://evil.example/?u=https://suno.com/s/vLU5fuz8292IriFc'), null);
  assert.equal(normaliseSunoShareLink('https://suno.com/song/abc'), null);
  assert.equal(normaliseSunoShareLink('https://suno.com/s/ab'), null);
  assert.equal(normaliseSunoShareLink('file:///etc/passwd'), null);
});

test('splits pasted text into ids, share links and leftovers', () => {
  const other = '11111111-2222-3333-4444-555555555555';
  const r = parseSunoLinks(
    `https://suno.com/song/${ID}\n${other}, https://suno.com/s/XyZ123\nhttps://suno.com/song/${ID}\nhttps://suno.com/s/XyZ123 nonsense`
  );
  assert.deepEqual(r.ids, [ID, other]); // duplicate removed, order kept
  assert.deepEqual(r.shareLinks, ['https://suno.com/s/XyZ123']);
  assert.deepEqual(r.unrecognised, ['nonsense']);
});

test('builds the page url from an id', () => {
  assert.equal(sunoSongUrl(ID), `https://suno.com/song/${ID}`);
});

test('resolveShareLink reads the redirect and never follows it', async () => {
  const calls: any[] = [];
  const fake = (async (url: string, init: any) => {
    calls.push({ url, redirect: init.redirect });
    return { headers: new Headers({ location: `/song/${ID}?sh=vLU5fuz8292IriFc` }), body: null };
  }) as any;
  assert.equal(await resolveShareLink('https://suno.com/s/vLU5fuz8292IriFc', fake), ID);
  assert.deepEqual(calls, [{ url: 'https://suno.com/s/vLU5fuz8292IriFc', redirect: 'manual' }]);
});

test('resolveShareLink refuses other hosts without making a request', async () => {
  let called = false;
  const fake = (async () => { called = true; return { headers: new Headers(), body: null }; }) as any;
  assert.equal(await resolveShareLink('https://evil.example/s/vLU5fuz8292IriFc', fake), null);
  assert.equal(called, false);
});

test('resolveShareLink returns null when there is no redirect or the request fails', async () => {
  const noRedirect = (async () => ({ headers: new Headers(), body: null })) as any;
  assert.equal(await resolveShareLink('https://suno.com/s/vLU5fuz8292IriFc', noRedirect), null);
  const boom = (async () => { throw new Error('network'); }) as any;
  assert.equal(await resolveShareLink('https://suno.com/s/vLU5fuz8292IriFc', boom), null);
});
