/*
  Music Factory: admin section + tables.

  NOT applied automatically. Review, then run against the live DB yourself (Supabase SQL editor,
  or: npx supabase@latest db query --linked --project-ref dgdkwycxdsiyyrqjaurr -f <this file>).
  Idempotent where practical; safe to re-run.

  1. Registers the 'music-factory' admin section (shared admin_permissions constraint +
     admin_set_section allow-list). Checked against the live DB 2026-10-19: constraint
     admin_permissions_section_check currently allows music, messages, images, moderation,
     templates, wait-screens, codes, permissions, iap, liability.
  2. Creates mf_settings, mf_batches, mf_jobs, mf_songs, all gated by has_admin_section('music-factory').

  Audio is NOT stored here. mp3 files are copied into the existing 'music' bucket and a
  music_tracks row on Publish (iteration 4), by a server-side Netlify function.
*/

-- 1. Admin section ------------------------------------------------------------------------

DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
   WHERE conrelid = 'public.admin_permissions'::regclass AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%section%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.admin_permissions DROP CONSTRAINT %I', c);
  END IF;
END $$;

ALTER TABLE public.admin_permissions ADD CONSTRAINT admin_permissions_section_check
  CHECK (section IN ('music','messages','images','moderation','templates','wait-screens','codes','permissions','iap','liability','music-factory'));

CREATE OR REPLACE FUNCTION public.admin_set_section(p_user_id uuid, p_section text, p_granted boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public._require_section('permissions');

  IF p_section NOT IN ('music','messages','images','moderation','templates','wait-screens','codes','permissions','iap','liability','music-factory') THEN
    RAISE EXCEPTION 'Unknown section %', p_section;
  END IF;

  -- Lock-out guard: you cannot remove your own access to this page.
  IF p_user_id = auth.uid() AND p_section = 'permissions' AND NOT p_granted THEN
    RAISE EXCEPTION 'You cannot remove your own Permissions access';
  END IF;

  IF p_granted THEN
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id AND is_super_admin) THEN
      RAISE EXCEPTION 'User is not a superadmin';
    END IF;
    INSERT INTO public.admin_permissions (user_id, section, granted_by)
    VALUES (p_user_id, p_section, auth.uid())
    ON CONFLICT (user_id, section) DO NOTHING;
  ELSE
    DELETE FROM public.admin_permissions WHERE user_id = p_user_id AND section = p_section;
  END IF;
END; $$;

-- (grants on admin_set_section are unchanged by CREATE OR REPLACE)

-- 2. Helper ---------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mf_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- 3. Settings: the editable prompt-creator prompt + model name -------------------------------

CREATE TABLE IF NOT EXISTS public.mf_settings (
  key        text PRIMARY KEY,           -- 'prompt', 'openai_model'
  value      text NOT NULL,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Batches --------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.mf_batches (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Jobs: one per brief. Holds the AI's original output and the curator's edits ---------------

CREATE TABLE IF NOT EXISTS public.mf_jobs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id         uuid REFERENCES public.mf_batches(id) ON DELETE CASCADE,
  parent_job_id    uuid REFERENCES public.mf_jobs(id) ON DELETE SET NULL,  -- "regenerate with a change"
  regen_note       text,                                                   -- e.g. "no horn stabs"
  -- curator input (searchable)
  brief_style      text NOT NULL,          -- "Stil:"
  brief_text       text NOT NULL,          -- "Text:"
  -- AI's original output (never overwritten)
  gen_style_prompt text,
  gen_lyrics       text,
  gen_title        text,
  gen_song_vibe    text,
  gen_model        text,
  -- curator's editable working copy (what goes to Suno)
  style_prompt     text,
  lyrics           text,
  title            text,
  status           text NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','generating','prompt_ready','queued','suno_generating','done','failed')),
  error            text,
  created_by       uuid DEFAULT auth.uid(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  search           tsvector GENERATED ALWAYS AS (to_tsvector('simple'::regconfig,
                     coalesce(brief_style,'') || ' ' || coalesce(brief_text,'') || ' ' ||
                     coalesce(style_prompt,'') || ' ' || coalesce(lyrics,'') || ' ' || coalesce(title,''))) STORED
);
CREATE INDEX IF NOT EXISTS mf_jobs_batch_idx  ON public.mf_jobs(batch_id);
CREATE INDEX IF NOT EXISTS mf_jobs_search_idx ON public.mf_jobs USING gin(search);
DROP TRIGGER IF EXISTS mf_jobs_touch ON public.mf_jobs;
CREATE TRIGGER mf_jobs_touch BEFORE UPDATE ON public.mf_jobs
  FOR EACH ROW EXECUTE FUNCTION public.mf_touch_updated_at();

-- 6. Songs: one per Suno song (2 per generation). Metadata only until Publish -----------------

CREATE TABLE IF NOT EXISTS public.mf_songs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id         uuid NOT NULL REFERENCES public.mf_jobs(id) ON DELETE CASCADE,
  suno_id        text UNIQUE,
  suno_url       text,                   -- suno.com/song/<id>
  audio_url      text,                   -- Suno CDN mp3: used for listening + the one-time copy on Publish
  title          text,
  style_tags     text,
  lyrics         text,
  suno_model     text,
  duration       numeric,
  song_vibe      text,                   -- curator's two-word take, e.g. "Slow Rockabilly"
  artist         text NOT NULL DEFAULT 'Mr Vibz',
  decision       text NOT NULL DEFAULT 'undecided' CHECK (decision IN ('undecided','keep','discard')),
  notes          text,
  music_track_id uuid REFERENCES public.music_tracks(id) ON DELETE SET NULL,  -- set on Publish
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  search         tsvector GENERATED ALWAYS AS (to_tsvector('simple'::regconfig,
                   coalesce(title,'') || ' ' || coalesce(style_tags,'') || ' ' ||
                   coalesce(lyrics,'') || ' ' || coalesce(song_vibe,''))) STORED
);
CREATE INDEX IF NOT EXISTS mf_songs_job_idx    ON public.mf_songs(job_id);
CREATE INDEX IF NOT EXISTS mf_songs_search_idx ON public.mf_songs USING gin(search);
DROP TRIGGER IF EXISTS mf_songs_touch ON public.mf_songs;
CREATE TRIGGER mf_songs_touch BEFORE UPDATE ON public.mf_songs
  FOR EACH ROW EXECUTE FUNCTION public.mf_touch_updated_at();

-- 7. RLS: only super admins holding the 'music-factory' section --------------------------------
-- No anon access. Netlify functions use the secret key (bypasses RLS) but verify the caller
-- with has_admin_section() themselves.

ALTER TABLE public.mf_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mf_batches  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mf_jobs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mf_songs    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mf_settings_all ON public.mf_settings;
CREATE POLICY mf_settings_all ON public.mf_settings FOR ALL TO authenticated
  USING (public.has_admin_section('music-factory')) WITH CHECK (public.has_admin_section('music-factory'));
DROP POLICY IF EXISTS mf_batches_all ON public.mf_batches;
CREATE POLICY mf_batches_all  ON public.mf_batches  FOR ALL TO authenticated
  USING (public.has_admin_section('music-factory')) WITH CHECK (public.has_admin_section('music-factory'));
DROP POLICY IF EXISTS mf_jobs_all ON public.mf_jobs;
CREATE POLICY mf_jobs_all     ON public.mf_jobs     FOR ALL TO authenticated
  USING (public.has_admin_section('music-factory')) WITH CHECK (public.has_admin_section('music-factory'));
DROP POLICY IF EXISTS mf_songs_all ON public.mf_songs;
CREATE POLICY mf_songs_all    ON public.mf_songs    FOR ALL TO authenticated
  USING (public.has_admin_section('music-factory')) WITH CHECK (public.has_admin_section('music-factory'));
