import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSunoLinks, parseSunoSongId, sunoAudioUrl, sunoSongUrl } from '../shared/suno.ts';

const ID = '0a1b2c3d-4e5f-6789-abcd-ef0123456789';

test('finds the id in song links, cdn links and bare ids', () => {
  assert.equal(parseSunoSongId(`https://suno.com/song/${ID}`), ID);
  assert.equal(parseSunoSongId(`https://suno.com/song/${ID}?sh=abc`), ID);
  assert.equal(parseSunoSongId(`https://app.suno.ai/song/${ID}/`), ID);
  assert.equal(parseSunoSongId(`https://cdn1.suno.ai/${ID}.mp3`), ID);
  assert.equal(parseSunoSongId(`  ${ID.toUpperCase()} `), ID);
});

test('returns null when there is no id (e.g. short share links)', () => {
  assert.equal(parseSunoSongId('https://suno.com/s/AbCdEf123'), null);
  assert.equal(parseSunoSongId('hello'), null);
  assert.equal(parseSunoSongId(''), null);
});

test('splits pasted text and reports what it could not use', () => {
  const other = '11111111-2222-3333-4444-555555555555';
  const r = parseSunoLinks(`https://suno.com/song/${ID}\n${other}, https://suno.com/s/XyZ\nhttps://suno.com/song/${ID}`);
  assert.deepEqual(r.ids, [ID, other]); // duplicate removed, order kept
  assert.deepEqual(r.unrecognised, ['https://suno.com/s/XyZ']);
});

test('builds urls from an id', () => {
  assert.equal(sunoSongUrl(ID), `https://suno.com/song/${ID}`);
  assert.equal(sunoAudioUrl(ID), `https://cdn1.suno.ai/${ID}.mp3`);
});
