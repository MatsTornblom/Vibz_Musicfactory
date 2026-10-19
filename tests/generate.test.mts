import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGeneration } from '../netlify/functions/_lib/generate.mts';
import { buildUserMessage, clampStylePrompt, DEFAULT_MODEL, DEFAULT_PROMPT, OUTPUT_CONTRACT } from '../shared/promptDefaults.ts';

// Minimal in-memory stand-in for the parts of the Supabase client that runGeneration uses.
type Row = Record<string, any>;
function fakeAdmin(tables: Record<string, Row[]>) {
  class Query {
    private filters: ((r: Row) => boolean)[] = [];
    private patch: Row | null = null;
    private table: string;
    constructor(table: string) { this.table = table; }
    select() { return this; }
    update(patch: Row) { this.patch = patch; return this; }
    eq(col: string, val: unknown) { this.filters.push(r => r[col] === val); return this; }
    in(col: string, vals: unknown[]) { this.filters.push(r => vals.includes(r[col])); return this; }
    private run() {
      const rows = (tables[this.table] ?? []).filter(r => this.filters.every(f => f(r)));
      if (this.patch) rows.forEach(r => Object.assign(r, this.patch));
      return rows;
    }
    single() { const r = this.run(); return Promise.resolve(r.length === 1 ? { data: r[0], error: null } : { data: null, error: { message: 'not found' } }); }
    maybeSingle() { const r = this.run(); return Promise.resolve({ data: r[0] ?? null, error: null }); }
    then(res: (v: { data: Row[]; error: null }) => unknown) { return Promise.resolve({ data: this.run(), error: null }).then(res); }
  }
  return { from: (t: string) => new Query(t) } as any;
}

function openAiReturning(content: unknown, calls: any[] = []): typeof fetch {
  return (async (_url: string, init: any) => {
    calls.push(JSON.parse(init.body));
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(content) } }] }),
    };
  }) as any;
}

const GOOD = { style_prompt: 'funk, 105 bpm', lyrics: '[Verse]\nla la', title: 'Good Day', song_vibe: 'Funky Sunshine' };
const newJob = (extra: Row = {}): Row => ({
  id: 'j1', brief_style: 'som Prince', brief_text: 'en bra dag', parent_job_id: null, regen_note: null,
  status: 'draft', error: null, ...extra,
});

test('stores the AI output and a working copy, and marks the job ready', async () => {
  const job = newJob();
  const calls: any[] = [];
  await runGeneration(fakeAdmin({ mf_jobs: [job], mf_settings: [] }), 'j1', { apiKey: 'k', fetchImpl: openAiReturning(GOOD, calls) });

  assert.equal(job.status, 'prompt_ready');
  assert.equal(job.error, null);
  assert.equal(job.gen_style_prompt, GOOD.style_prompt);
  assert.equal(job.style_prompt, GOOD.style_prompt); // working copy starts equal to the original
  assert.equal(job.gen_song_vibe, 'Funky Sunshine');
  assert.equal(job.gen_model, DEFAULT_MODEL);
  // default prompt + fixed contract in the system message; brief as Stil/Text
  assert.equal(calls[0].model, DEFAULT_MODEL);
  assert.equal(calls[0].messages[0].content, `${DEFAULT_PROMPT}\n\n${OUTPUT_CONTRACT}`);
  assert.equal(calls[0].messages[1].content, 'Stil: som Prince\nText: en bra dag');
  assert.equal(calls[0].response_format.type, 'json_schema');
  assert.equal(calls[0].temperature, undefined);
});

test('uses the saved prompt and model from settings', async () => {
  const job = newJob();
  const calls: any[] = [];
  const settings = [{ key: 'prompt', value: 'MY PROMPT' }, { key: 'openai_model', value: 'my-model' }];
  await runGeneration(fakeAdmin({ mf_jobs: [job], mf_settings: settings }), 'j1', { apiKey: 'k', fetchImpl: openAiReturning(GOOD, calls) });
  assert.equal(calls[0].model, 'my-model');
  assert.ok(calls[0].messages[0].content.startsWith('MY PROMPT\n\n'));
  assert.equal(job.gen_model, 'my-model');
});

test('regenerating sends the previous version and the requested change', async () => {
  const parent = { id: 'p1', style_prompt: 'funk, horn stabs', lyrics: 'old lyrics', title: 'Old' };
  const job = newJob({ parent_job_id: 'p1', regen_note: 'remove the horn stabs' });
  const calls: any[] = [];
  await runGeneration(fakeAdmin({ mf_jobs: [parent, job], mf_settings: [] }), 'j1', { apiKey: 'k', fetchImpl: openAiReturning(GOOD, calls) });
  const user = calls[0].messages[1].content as string;
  assert.match(user, /Previous version:/);
  assert.match(user, /funk, horn stabs/);
  assert.match(user, /Requested change: remove the horn stabs/);
});

test('an over-long style prompt is cut at the last comma that fits', async () => {
  const long = Array.from({ length: 60 }, (_, i) => `tag number ${i}`).join(', ');
  const job = newJob();
  await runGeneration(fakeAdmin({ mf_jobs: [job], mf_settings: [] }), 'j1', { apiKey: 'k', fetchImpl: openAiReturning({ ...GOOD, style_prompt: long }) });
  assert.ok(job.style_prompt.length <= 300);
  assert.ok(!job.style_prompt.endsWith(','));
  assert.ok(long.startsWith(job.style_prompt));
});

test('an OpenAI error fails the job with a readable message', async () => {
  const job = newJob();
  const failing = (async () => ({ ok: false, status: 404, json: async () => ({ error: { message: 'The model `nope` does not exist' } }) })) as any;
  await runGeneration(fakeAdmin({ mf_jobs: [job], mf_settings: [] }), 'j1', { apiKey: 'k', fetchImpl: failing });
  assert.equal(job.status, 'failed');
  assert.match(job.error, /does not exist/);
  assert.equal(job.style_prompt, undefined); // nothing half-written
});

test('a response missing a field fails the job', async () => {
  const job = newJob();
  await runGeneration(fakeAdmin({ mf_jobs: [job], mf_settings: [] }), 'j1', { apiKey: 'k', fetchImpl: openAiReturning({ ...GOOD, lyrics: '' }) });
  assert.equal(job.status, 'failed');
  assert.match(job.error, /lyrics/);
});

test('a missing job does not throw', async () => {
  await runGeneration(fakeAdmin({ mf_jobs: [], mf_settings: [] }), 'nope', { apiKey: 'k', fetchImpl: openAiReturning(GOOD) });
});

test('helpers', () => {
  assert.equal(clampStylePrompt('a, b'), 'a, b');
  assert.equal(clampStylePrompt('x'.repeat(400)).length, 300); // no comma: hard cut
  assert.equal(buildUserMessage({ brief_style: ' s ', brief_text: ' t ' }), 'Stil: s\nText: t');
  // a note without a previous version (or vice versa) is ignored
  assert.equal(buildUserMessage({ brief_style: 's', brief_text: 't', regen_note: 'x' }), 'Stil: s\nText: t');
});
