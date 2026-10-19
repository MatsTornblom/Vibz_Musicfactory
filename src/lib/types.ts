export type JobStatus = 'draft' | 'generating' | 'prompt_ready' | 'queued' | 'suno_generating' | 'done' | 'failed';

export interface Batch {
  id: string;
  name: string;
  created_at: string;
}

export interface Job {
  id: string;
  batch_id: string | null;
  parent_job_id: string | null;
  regen_note: string | null;
  brief_style: string;
  brief_text: string;
  gen_style_prompt: string | null;
  gen_lyrics: string | null;
  gen_title: string | null;
  gen_song_vibe: string | null;
  gen_model: string | null;
  style_prompt: string | null;
  lyrics: string | null;
  title: string | null;
  status: JobStatus;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export type Decision = 'undecided' | 'keep' | 'discard';

export interface Song {
  id: string;
  job_id: string;
  suno_id: string | null;
  suno_url: string | null;
  audio_url: string | null;
  title: string | null;
  style_tags: string | null;
  lyrics: string | null;
  suno_model: string | null;
  duration: number | null;
  song_vibe: string | null;
  artist: string;
  decision: Decision;
  notes: string | null;
  music_track_id: string | null;
  created_at: string;
}

/** A song plus the brief it came from, for the folder-wide review screen. */
export interface SongWithJob extends Song {
  job: Pick<Job, 'id' | 'batch_id' | 'brief_style' | 'brief_text' | 'title'>;
}
