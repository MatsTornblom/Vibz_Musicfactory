import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DEFAULT_MODEL,
  DEFAULT_PROMPT,
  OUTPUT_CONTRACT,
  OUTPUT_SCHEMA,
  SETTING_KEYS,
  buildUserMessage,
  clampStylePrompt,
  type GenerationOutput,
} from '../../../shared/promptDefaults.ts';

type FetchLike = typeof fetch;

function parseOutput(content: string): GenerationOutput {
  const parsed = JSON.parse(content);
  for (const k of ['style_prompt', 'lyrics', 'title', 'song_vibe'] as const) {
    if (typeof parsed[k] !== 'string' || !parsed[k].trim()) {
      throw new Error(`The AI response is missing "${k}"`);
    }
  }
  return {
    style_prompt: clampStylePrompt(parsed.style_prompt),
    lyrics: parsed.lyrics.trim(),
    title: parsed.title.trim(),
    song_vibe: parsed.song_vibe.trim(),
  };
}

async function callOpenAI(
  apiKey: string,
  model: string,
  system: string,
  user: string,
  fetchImpl: FetchLike
): Promise<GenerationOutput> {
  // No temperature / max_tokens: newer OpenAI model families reject them.
  const res = await fetchImpl('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_schema', json_schema: OUTPUT_SCHEMA },
    }),
  });

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = body?.error?.message ?? `OpenAI returned HTTP ${res.status}`;
    throw new Error(`OpenAI: ${msg}`);
  }
  const choice = body?.choices?.[0];
  if (choice?.message?.refusal) throw new Error(`The AI refused: ${choice.message.refusal}`);
  const content = choice?.message?.content;
  if (!content) throw new Error('The AI returned an empty response');
  return parseOutput(content);
}

/**
 * Generate (or regenerate) the Suno prompt for one job and store the result.
 * The AI's original output goes to gen_*; the editable working copy is overwritten with it.
 * Never throws: failures are written to the job (status 'failed' + error) for the UI to show.
 */
export async function runGeneration(
  admin: SupabaseClient,
  jobId: string,
  opts: { apiKey: string; fetchImpl?: FetchLike }
): Promise<void> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const fail = async (message: string) => {
    await admin.from('mf_jobs').update({ status: 'failed', error: message.slice(0, 1000) }).eq('id', jobId);
  };

  try {
    const { data: job, error: jobErr } = await admin.from('mf_jobs').select('*').eq('id', jobId).single();
    if (jobErr || !job) throw new Error('Job not found');

    await admin.from('mf_jobs').update({ status: 'generating', error: null }).eq('id', jobId);

    const { data: settings } = await admin
      .from('mf_settings')
      .select('key,value')
      .in('key', [SETTING_KEYS.prompt, SETTING_KEYS.model]);
    const get = (k: string) => settings?.find(s => s.key === k)?.value?.trim() || '';
    const creative = get(SETTING_KEYS.prompt) || DEFAULT_PROMPT;
    const model = get(SETTING_KEYS.model) || DEFAULT_MODEL;

    let previous;
    if (job.parent_job_id && job.regen_note) {
      const { data: parent } = await admin
        .from('mf_jobs')
        .select('style_prompt,lyrics,title')
        .eq('id', job.parent_job_id)
        .maybeSingle();
      if (parent) previous = parent;
    }

    const out = await callOpenAI(
      opts.apiKey,
      model,
      `${creative}\n\n${OUTPUT_CONTRACT}`,
      buildUserMessage({
        brief_style: job.brief_style,
        brief_text: job.brief_text,
        previous,
        regen_note: job.regen_note,
      }),
      fetchImpl
    );

    const { error: saveErr } = await admin
      .from('mf_jobs')
      .update({
        gen_style_prompt: out.style_prompt,
        gen_lyrics: out.lyrics,
        gen_title: out.title,
        gen_song_vibe: out.song_vibe,
        gen_model: model,
        style_prompt: out.style_prompt,
        lyrics: out.lyrics,
        title: out.title,
        status: 'prompt_ready',
        error: null,
      })
      .eq('id', jobId);
    if (saveErr) throw new Error(`Could not save the result: ${saveErr.message}`);
  } catch (e) {
    await fail(e instanceof Error ? e.message : String(e));
  }
}
