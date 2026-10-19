import { supabase } from './supabase';
import { DEFAULT_MODEL, DEFAULT_PROMPT, SETTING_KEYS } from '../../shared/promptDefaults';
import type { Batch, Job } from './types';

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

// --- Batches ------------------------------------------------------------------------------

export interface BatchWithCount extends Batch {
  job_count: number;
}

export async function listBatches(): Promise<BatchWithCount[]> {
  const batches = check(await supabase.from('mf_batches').select('*').order('created_at', { ascending: false })) as Batch[];
  const jobs = check(await supabase.from('mf_jobs').select('batch_id')) as { batch_id: string | null }[];
  const counts = new Map<string, number>();
  for (const j of jobs) if (j.batch_id) counts.set(j.batch_id, (counts.get(j.batch_id) ?? 0) + 1);
  return batches.map(b => ({ ...b, job_count: counts.get(b.id) ?? 0 }));
}

export async function createBatch(name: string): Promise<Batch> {
  return check(await supabase.from('mf_batches').insert({ name }).select().single()) as Batch;
}

export async function getBatch(id: string): Promise<Batch> {
  return check(await supabase.from('mf_batches').select('*').eq('id', id).single()) as Batch;
}

// --- Jobs ---------------------------------------------------------------------------------

export async function listJobs(batchId: string): Promise<Job[]> {
  return check(
    await supabase.from('mf_jobs').select('*').eq('batch_id', batchId).order('created_at', { ascending: false })
  ) as Job[];
}

export async function getJob(id: string): Promise<Job> {
  return check(await supabase.from('mf_jobs').select('*').eq('id', id).single()) as Job;
}

export async function createJob(batchId: string, briefStyle: string, briefText: string): Promise<Job> {
  return check(
    await supabase
      .from('mf_jobs')
      .insert({ batch_id: batchId, brief_style: briefStyle.trim(), brief_text: briefText.trim() })
      .select()
      .single()
  ) as Job;
}

/** "Regenerate with a change": a new job that keeps the brief and links to the one it came from. */
export async function createRegenJob(parent: Job, note: string): Promise<Job> {
  return check(
    await supabase
      .from('mf_jobs')
      .insert({
        batch_id: parent.batch_id,
        parent_job_id: parent.id,
        regen_note: note.trim(),
        brief_style: parent.brief_style,
        brief_text: parent.brief_text,
      })
      .select()
      .single()
  ) as Job;
}

export type JobEdit = Partial<Pick<Job, 'brief_style' | 'brief_text' | 'style_prompt' | 'lyrics' | 'title'>>;

export async function updateJob(id: string, patch: JobEdit): Promise<void> {
  check(await supabase.from('mf_jobs').update(patch).eq('id', id).select('id').single());
}

export async function deleteJob(id: string): Promise<void> {
  const { error } = await supabase.from('mf_jobs').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Ask the server to (re)generate the prompt. Returns once it has started; poll the job for the result. */
export async function startGeneration(jobId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not logged in');
  const res = await fetch('/.netlify/functions/generate-prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ job_id: jobId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Could not start generation (HTTP ${res.status})`);
  }
}

// --- Settings -----------------------------------------------------------------------------

export interface FactorySettings {
  prompt: string;
  model: string;
}

export async function loadSettings(): Promise<FactorySettings> {
  const rows = check(await supabase.from('mf_settings').select('key,value')) as { key: string; value: string }[];
  const get = (k: string) => rows.find(r => r.key === k)?.value?.trim() || '';
  return {
    prompt: get(SETTING_KEYS.prompt) || DEFAULT_PROMPT,
    model: get(SETTING_KEYS.model) || DEFAULT_MODEL,
  };
}

export async function saveSettings(s: FactorySettings): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const now = new Date().toISOString();
  const res = await supabase.from('mf_settings').upsert([
    { key: SETTING_KEYS.prompt, value: s.prompt, updated_by: user?.id ?? null, updated_at: now },
    { key: SETTING_KEYS.model, value: s.model.trim(), updated_by: user?.id ?? null, updated_at: now },
  ]);
  if (res.error) throw new Error(res.error.message);
}
