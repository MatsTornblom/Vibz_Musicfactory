import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { getBatch, listSongsForFolder, updateSong } from '../lib/api';
import type { Batch, Decision, SongWithJob } from '../lib/types';
import { SongCard } from './SongCard';

type Filter = 'undecided' | 'keep' | 'discard' | 'all';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'undecided', label: 'To review' },
  { key: 'keep', label: 'Keep' },
  { key: 'discard', label: 'Discard' },
  { key: 'all', label: 'All' },
];

const DOT: Record<Decision, string> = {
  keep: 'bg-green-500',
  discard: 'bg-red-500',
  undecided: 'bg-gray-500',
};

export function Review() {
  const { batchId = '' } = useParams();
  const [folder, setFolder] = useState<Batch | null>(null);
  const [songs, setSongs] = useState<SongWithJob[] | null>(null);
  const [filter, setFilter] = useState<Filter>('undecided');
  const [index, setIndex] = useState(0);
  const [autoplay, setAutoplay] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    getBatch(batchId).then(setFolder).catch(e => setError(e.message));
    listSongsForFolder(batchId)
      .then(list => {
        setSongs(list);
        // Nothing left to review? Show everything instead of an empty screen.
        if (!list.some(s => s.decision === 'undecided')) setFilter('all');
      })
      .catch(e => setError(e.message));
  }, [batchId]);

  const counts = useMemo(() => {
    const c = { undecided: 0, keep: 0, discard: 0, all: songs?.length ?? 0 };
    songs?.forEach(s => { c[s.decision] += 1; });
    return c;
  }, [songs]);

  const visible = useMemo(
    () => (songs ?? []).filter(s => filter === 'all' || s.decision === filter),
    [songs, filter]
  );

  // Keep the position valid when the list shrinks (a decided song leaves "To review").
  useEffect(() => {
    if (index > 0 && index >= visible.length) setIndex(Math.max(0, visible.length - 1));
  }, [visible.length, index]);

  const current = visible[index] ?? null;

  const replaceSong = useCallback((u: SongWithJob) => {
    setSongs(list => (list ?? []).map(x => (x.id === u.id ? u : x)));
  }, []);

  const decide = useCallback(
    async (decision: Decision) => {
      if (!current) return;
      try {
        await updateSong(current.id, { decision });
        replaceSong({ ...current, decision });
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [current, replaceSong]
  );

  const move = useCallback(
    (delta: number) => setIndex(i => Math.min(Math.max(0, i + delta), Math.max(0, visible.length - 1))),
    [visible.length]
  );

  // Keyboard shortcuts, ignored while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === ' ') {
        e.preventDefault();
        const a = audioRef.current;
        if (a) (a.paused ? a.play().catch(() => {}) : a.pause());
      } else if (k === 'k') decide('keep');
      else if (k === 'd') decide('discard');
      else if (k === 'arrowright' || k === 'l') move(1);
      else if (k === 'arrowleft' || k === 'j') move(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [decide, move]);

  return (
    <div className="space-y-6">
      <Link to={`/folders/${batchId}`} className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white">
        <ArrowLeft size={16} /> Back to folder
      </Link>
      <h1 className="text-3xl font-bold">Listen and decide{folder ? `: ${folder.name}` : ''}</h1>

      {error && <div className="bg-red-500/10 text-red-500 px-4 py-2 rounded-lg">{error}</div>}

      {songs === null ? (
        <div className="text-gray-400 flex items-center gap-2"><Loader2 size={18} className="animate-spin" /> Loading…</div>
      ) : songs.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-6 text-gray-300 max-w-2xl">
          No songs in this folder yet. Open a song prompt, make the song in Suno and paste its link under &ldquo;Songs from Suno&rdquo;.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => { setFilter(f.key); setIndex(0); }}
                className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                  filter === f.key ? 'bg-pink-500/20 text-pink-500' : 'bg-gray-800 hover:bg-gray-700'
                }`}
              >
                {f.label} <span className="text-gray-400">({counts[f.key]})</span>
              </button>
            ))}
            <label className="ml-auto flex items-center gap-2 text-sm text-gray-400">
              <input type="checkbox" checked={autoplay} onChange={e => setAutoplay(e.target.checked)} className="accent-pink-500" />
              Autoplay
            </label>
          </div>

          <div className="text-sm text-gray-500">
            Shortcuts: <kbd className="px-1 bg-gray-800 rounded">Space</kbd> play/pause ·{' '}
            <kbd className="px-1 bg-gray-800 rounded">K</kbd> keep · <kbd className="px-1 bg-gray-800 rounded">D</kbd> discard ·{' '}
            <kbd className="px-1 bg-gray-800 rounded">←</kbd>/<kbd className="px-1 bg-gray-800 rounded">→</kbd> previous / next
          </div>

          {visible.length === 0 ? (
            <div className="bg-gray-800 rounded-lg p-6 text-gray-300 max-w-2xl">
              Nothing here.{' '}
              {filter === 'undecided' && 'Everything has been decided.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              <div className="lg:col-span-2 space-y-3">
                <div className="text-sm text-gray-400">
                  Song {index + 1} of {visible.length}
                </div>
                {current && (
                  <SongCard
                    key={current.id}
                    song={current}
                    context={`From: ${current.job.brief_style}`}
                    onChange={u => replaceSong({ ...current, ...u })}
                    onError={setError}
                    audioRef={audioRef}
                    autoPlay={autoplay}
                  />
                )}
                <div className="flex gap-2">
                  <button onClick={() => move(-1)} disabled={index === 0} className="px-4 py-2 bg-gray-800 rounded-lg hover:bg-gray-700 disabled:opacity-40">Previous</button>
                  <button onClick={() => move(1)} disabled={index >= visible.length - 1} className="px-4 py-2 bg-gray-800 rounded-lg hover:bg-gray-700 disabled:opacity-40">Next</button>
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg divide-y divide-gray-700 max-h-[70vh] overflow-y-auto">
                {visible.map((s, i) => (
                  <button
                    key={s.id}
                    onClick={() => setIndex(i)}
                    className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-700/60 ${i === index ? 'bg-pink-500/10' : ''}`}
                  >
                    <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${DOT[s.decision]}`} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{s.title || 'Untitled'}</span>
                      <span className="block truncate text-xs text-gray-500">{s.song_vibe || s.job.brief_style}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
