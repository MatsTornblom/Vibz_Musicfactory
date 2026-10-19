import { supabase } from './supabase';
import { DEFAULT_MODEL, DEFAULT_PROMPT, SETTING_KEYS } from '../../shared/promptDefaults';
import { sunoSongUrl } from '../../shared/suno';
import type { Batch, Job, Song, SongWithJob } from './types';

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

// --- Songs --------------------------------------------------------------------------------

/** Look up the song id behind Suno share links (suno.com/s/...). Needs the server: browsers cannot read the redirect. */
export async function resolveShareLinks(urls: string[]): Promise<{ resolved: Record<string, string>; failed: string[] }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not logged in');
  const res = await fetch('/.netlify/functions/resolve-suno-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ urls }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `Could not look up the share links (HTTP ${res.status})`);
  return body as { resolved: Record<string, string>; failed: string[] };
}

export async function listSongsForJob(jobId: string): Promise<Song[]> {
  return check(
    await supabase.from('mf_songs').select('*').eq('job_id', jobId).order('created_at', { ascending: true })
  ) as Song[];
}

export async function listSongsForFolder(batchId: string): Promise<SongWithJob[]> {
  return check(
    await supabase
      .from('mf_songs')
      .select('*, job:mf_jobs!inner(id,batch_id,brief_style,brief_text,title)')
      .eq('job.batch_id', batchId)
      .order('created_at', { ascending: true })
  ) as unknown as SongWithJob[];
}

/**
 * Register songs the curator made in Suno. Title, style tags and lyrics start as what we sent
 * to Suno (the job's working copy) and the song vibe as the AI's suggestion; all editable after.
 * Returns how many were added and which ids were already there.
 */
export async function addSongs(job: Job, sunoIds: string[]): Promise<{ added: number; duplicates: string[] }> {
  const existing = check(
    await supabase.from('mf_songs').select('suno_id').in('suno_id', sunoIds)
  ) as { suno_id: string }[];
  const have = new Set(existing.map(e => e.suno_id));
  const fresh = sunoIds.filter(id => !have.has(id));

  if (fresh.length) {
    const rows = fresh.map(id => ({
      job_id: job.id,
      suno_id: id,
      suno_url: sunoSongUrl(id),
      title: job.title,
      style_tags: job.style_prompt,
      lyrics: job.lyrics,
      song_vibe: job.gen_song_vibe,
    }));
    const { error } = await supabase.from('mf_songs').insert(rows);
    if (error) throw new Error(error.message);
    if (job.status !== 'done') await supabase.from('mf_jobs').update({ status: 'done' }).eq('id', job.id);
  }
  return { added: fresh.length, duplicates: sunoIds.filter(id => have.has(id)) };
}

export type SongEdit = Partial<Pick<Song, 'title' | 'song_vibe' | 'artist' | 'notes' | 'decision'>>;

export async function updateSong(id: string, patch: SongEdit): Promise<void> {
  const { error } = await supabase.from('mf_songs').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteSong(id: string): Promise<void> {
  const { error } = await supabase.from('mf_songs').delete().eq('id', id);
  if (error) throw new Error(error.message);
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
