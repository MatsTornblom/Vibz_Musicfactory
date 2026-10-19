import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Copy, Loader2, Music, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import { STYLE_PROMPT_MAX } from '../../shared/promptDefaults';
import { parseSunoLinks } from '../../shared/suno';
import {
  addSongs,
  createRegenJob,
  deleteJob,
  getJob,
  listSongsForJob,
  startGeneration,
  updateJob,
  type JobEdit,
} from '../lib/api';
import type { Job, Song } from '../lib/types';
import { SongCard } from './SongCard';
import { StatusBadge } from './StatusBadge';

const STUCK_AFTER_MS = 5 * 60 * 1000;

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the text stays selectable in its field.
    }
  };
  return (
    <button
      onClick={copy}
      disabled={!text}
      className="px-3 py-1 text-sm bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors flex items-center gap-1 disabled:opacity-50"
    >
      {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
      {copied ? 'Copied' : label}
    </button>
  );
}

export function JobEditor() {
  const { jobId = '' } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [songs, setSongs] = useState<Song[]>([]);
  const [links, setLinks] = useState('');
  const [linkMsg, setLinkMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Local copies of the editable fields; saved to the database on blur.
  const [fields, setFields] = useState({ brief_style: '', brief_text: '', style_prompt: '', lyrics: '', title: '' });
  const lastLoaded = useRef<string>('');

  const applyJob = useCallback((j: Job) => {
    setJob(j);
    // Only overwrite the editor fields when the row actually changed on the server
    // (first load, or a generation finished), never while the curator is typing.
    const sig = `${j.updated_at}|${j.status}`;
    if (sig !== lastLoaded.current) {
      lastLoaded.current = sig;
      setFields({
        brief_style: j.brief_style,
        brief_text: j.brief_text,
        style_prompt: j.style_prompt ?? '',
        lyrics: j.lyrics ?? '',
        title: j.title ?? '',
      });
    }
  }, []);

  useEffect(() => {
    getJob(jobId).then(applyJob).catch(e => setError(e.message));
    listSongsForJob(jobId).then(setSongs).catch(e => setError(e.message));
  }, [jobId, applyJob]);

  const addFromLinks = async () => {
    const { ids, unrecognised } = parseSunoLinks(links);
    if (!ids.length) {
      setLinkMsg({
        ok: false,
        text: unrecognised.length
          ? 'No song id found. Open the song in Suno and copy its address (suno.com/song/…). Short share links (suno.com/s/…) do not work.'
          : 'Paste at least one Suno song link.',
      });
      return;
    }
    setBusy(true);
    setLinkMsg(null);
    try {
      const fresh = await getJob(jobId); // make sure we copy the latest saved prompt
      const { added, duplicates } = await addSongs(fresh, ids);
      setSongs(await listSongsForJob(jobId));
      applyJob(await getJob(jobId));
      setLinks('');
      const parts = [`Added ${added} song${added === 1 ? '' : 's'}.`];
      if (duplicates.length) parts.push(`${duplicates.length} already in the tool.`);
      if (unrecognised.length) parts.push(`Ignored: ${unrecognised.join(', ')}`);
      setLinkMsg({ ok: true, text: parts.join(' ') });
    } catch (e) {
      setLinkMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  // Poll while the AI is working.
  const generating = job?.status === 'generating';
  useEffect(() => {
    if (!generating) return;
    const t = setInterval(() => getJob(jobId).then(applyJob).catch(() => {}), 2000);
    return () => clearInterval(t);
  }, [generating, jobId, applyJob]);

  const stuck = generating && job && Date.now() - new Date(job.updated_at).getTime() > STUCK_AFTER_MS;

  const saveField = async (key: keyof JobEdit) => {
    if (!job) return;
    const current = (job[key as keyof Job] as string | null) ?? '';
    if (fields[key as keyof typeof fields] === current) return;
    try {
      await updateJob(job.id, { [key]: fields[key as keyof typeof fields] } as JobEdit);
      const fresh = await getJob(job.id);
      lastLoaded.current = `${fresh.updated_at}|${fresh.status}`; // our own save: keep the field as typed
      setJob(fresh);
      setSaved('Saved');
      setTimeout(() => setSaved(null), 1500);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const generate = async () => {
    if (!job) return;
    if (job.style_prompt && !confirm('Generate again? This replaces the prompt and lyrics you see now (your edits will be lost).')) return;
    setBusy(true);
    setError(null);
    try {
      await startGeneration(job.id);
      applyJob(await getJob(job.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const restoreOriginal = async () => {
    if (!job?.gen_style_prompt) return;
    if (!confirm('Restore the original AI output? Your edits will be lost.')) return;
    try {
      await updateJob(job.id, { style_prompt: job.gen_style_prompt, lyrics: job.gen_lyrics ?? '', title: job.gen_title ?? '' });
      applyJob(await getJob(job.id));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const regenerateWithChange = async () => {
    if (!job || !note.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const child = await createRegenJob(job, note);
      try {
        await startGeneration(child.id);
      } catch (e) {
        setError(`New version saved, but generation did not start: ${(e as Error).message}`);
      }
      setNote('');
      navigate(`/jobs/${child.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!job || !confirm('Delete this brief and everything generated from it?')) return;
    try {
      await deleteJob(job.id);
      navigate(job.batch_id ? `/folders/${job.batch_id}` : '/');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!job) {
    return error ? (
      <div className="bg-red-500/10 text-red-500 px-4 py-2 rounded-lg">{error}</div>
    ) : (
      <div className="text-gray-400 flex items-center gap-2"><Loader2 size={18} className="animate-spin" /> Loading…</div>
    );
  }

  const hasResult = !!(job.style_prompt || job.lyrics || job.title);
  const edited =
    hasResult &&
    (fields.style_prompt !== (job.gen_style_prompt ?? '') ||
      fields.lyrics !== (job.gen_lyrics ?? '') ||
      fields.title !== (job.gen_title ?? ''));
  const over = fields.style_prompt.length > STYLE_PROMPT_MAX;

  return (
    <div className="space-y-6 max-w-4xl">
      <Link
        to={job.batch_id ? `/folders/${job.batch_id}` : '/'}
        className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white"
      >
        <ArrowLeft size={16} /> Back to folder
      </Link>

      <div className="flex items-center gap-4">
        <h1 className="text-3xl font-bold">{fields.title || 'Untitled brief'}</h1>
        <StatusBadge status={job.status} />
        {saved && <span className="text-sm text-green-500">{saved}</span>}
      </div>

      {job.parent_job_id && (
        <p className="text-sm text-gray-400">
          Regenerated from{' '}
          <Link to={`/jobs/${job.parent_job_id}`} className="text-pink-400 hover:underline">an earlier version</Link>
          {job.regen_note && <> with the change: <em>{job.regen_note}</em></>}
        </p>
      )}

      {error && <div className="bg-red-500/10 text-red-500 px-4 py-2 rounded-lg">{error}</div>}
      {job.status === 'failed' && job.error && (
        <div className="bg-red-500/10 text-red-400 px-4 py-3 rounded-lg">
          <div className="font-medium">Generation failed</div>
          <div className="text-sm mt-1 break-words">{job.error}</div>
        </div>
      )}
      {stuck && (
        <div className="bg-yellow-500/10 text-yellow-500 px-4 py-3 rounded-lg">
          This has been generating for over 5 minutes and is probably stuck. Press Generate to try again.
        </div>
      )}

      {/* Brief */}
      <div className="bg-gray-800 rounded-lg p-6 space-y-4">
        <h2 className="text-xl font-semibold">Brief</h2>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Stil</label>
          <textarea
            value={fields.brief_style}
            onChange={e => setFields(f => ({ ...f, brief_style: e.target.value }))}
            onBlur={() => saveField('brief_style')}
            rows={2}
            className="w-full px-4 py-2 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Text</label>
          <textarea
            value={fields.brief_text}
            onChange={e => setFields(f => ({ ...f, brief_text: e.target.value }))}
            onBlur={() => saveField('brief_text')}
            rows={2}
            className="w-full px-4 py-2 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
          />
        </div>
        <button
          onClick={generate}
          disabled={busy || generating}
          className="px-4 py-2 bg-pink-500 rounded-lg hover:bg-pink-600 transition-colors flex items-center gap-2 disabled:opacity-50"
        >
          {busy || generating ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
          {hasResult ? 'Generate again' : 'Generate'}
        </button>
      </div>

      {/* Result */}
      {hasResult && (
        <div className="bg-gray-800 rounded-lg p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Suno prompt</h2>
            {job.gen_song_vibe && (
              <span className="text-sm text-gray-400">
                Suggested song vibe: <span className="text-white font-medium">{job.gen_song_vibe}</span>
              </span>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm text-gray-400">Style prompt</label>
              <div className="flex items-center gap-3">
                <span className={`text-xs ${over ? 'text-red-500 font-medium' : 'text-gray-500'}`}>
                  {fields.style_prompt.length} / {STYLE_PROMPT_MAX}
                </span>
                <CopyButton text={fields.style_prompt} label="Copy style" />
              </div>
            </div>
            <textarea
              value={fields.style_prompt}
              onChange={e => setFields(f => ({ ...f, style_prompt: e.target.value }))}
              onBlur={() => saveField('style_prompt')}
              rows={4}
              className={`w-full px-4 py-2 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 ${over ? 'ring-2 ring-red-500 focus:ring-red-500' : 'focus:ring-pink-500'}`}
            />
            {over && <p className="text-xs text-red-500 mt-1">Longer than Suno's {STYLE_PROMPT_MAX}-character style limit. Trim it before pasting.</p>}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm text-gray-400">Lyrics</label>
              <CopyButton text={fields.lyrics} label="Copy lyrics" />
            </div>
            <textarea
              value={fields.lyrics}
              onChange={e => setFields(f => ({ ...f, lyrics: e.target.value }))}
              onBlur={() => saveField('lyrics')}
              rows={16}
              className="w-full px-4 py-2 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 font-mono text-sm"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm text-gray-400">Title</label>
              <CopyButton text={fields.title} label="Copy title" />
            </div>
            <input
              value={fields.title}
              onChange={e => setFields(f => ({ ...f, title: e.target.value }))}
              onBlur={() => saveField('title')}
              className="w-full px-4 py-2 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
            />
          </div>

          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Original AI output is kept{job.gen_model ? ` (model: ${job.gen_model})` : ''}.</span>
            {edited && (
              <button onClick={restoreOriginal} className="inline-flex items-center gap-1 text-gray-300 hover:text-white">
                <RotateCcw size={14} /> Restore original
              </button>
            )}
          </div>
        </div>
      )}

      {/* Songs from Suno */}
      {hasResult && (
        <div className="bg-gray-800 rounded-lg p-6 space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2"><Music size={20} /> Songs from Suno</h2>
          <p className="text-sm text-gray-400">
            Paste the Suno link of each song you made from this prompt, one per line (Suno makes two per generation).
            Title, style and lyrics are filled in from the prompt above and the song vibe from the AI&apos;s suggestion.
            You can edit them on each song.
          </p>
          <textarea
            value={links}
            onChange={e => setLinks(e.target.value)}
            rows={2}
            placeholder="https://suno.com/song/…"
            className="w-full px-4 py-2 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 font-mono text-sm"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={addFromLinks}
              disabled={busy || !links.trim()}
              className="px-4 py-2 bg-pink-500 rounded-lg hover:bg-pink-600 transition-colors disabled:opacity-50"
            >
              Add songs
            </button>
            {linkMsg && <span className={`text-sm ${linkMsg.ok ? 'text-green-500' : 'text-red-500'}`}>{linkMsg.text}</span>}
          </div>

          {songs.length > 0 && (
            <div className="space-y-4 pt-2">
              {songs.map(s => (
                <SongCard
                  key={s.id}
                  song={s}
                  onChange={u => setSongs(list => list.map(x => (x.id === u.id ? u : x)))}
                  onDelete={id => setSongs(list => list.filter(x => x.id !== id))}
                  onError={setError}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Regenerate with a change */}
      {hasResult && (
        <div className="bg-gray-800 rounded-lg p-6 space-y-3">
          <h2 className="text-xl font-semibold">Regenerate with a change</h2>
          <p className="text-sm text-gray-400">
            Keeps this version as it is and makes a new one with your change applied, for example &ldquo;remove the horn stabs&rdquo;.
          </p>
          <div className="flex gap-3">
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="What should be different?"
              className="flex-1 px-4 py-2 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
            />
            <button
              onClick={regenerateWithChange}
              disabled={busy || !note.trim()}
              className="px-4 py-2 bg-pink-500 rounded-lg hover:bg-pink-600 transition-colors disabled:opacity-50"
            >
              Regenerate
            </button>
          </div>
        </div>
      )}

      <button onClick={remove} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-red-500">
        <Trash2 size={14} /> Delete this brief
      </button>
    </div>
  );
}
