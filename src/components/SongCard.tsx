import { useEffect, useState } from 'react';
import { Check, ExternalLink, Headphones, Trash2, Undo2, X } from 'lucide-react';
import { deleteSong, updateSong, type SongEdit } from '../lib/api';
import type { Decision, Song } from '../lib/types';

interface Props {
  song: Song;
  onChange: (song: Song) => void;
  onDelete?: (id: string) => void;
  onError: (message: string) => void;
  /** Shown above the title, e.g. the song prompt this song came from. */
  context?: string;
}

const DECISION_STYLE: Record<Decision, string> = {
  keep: 'bg-green-500/20 text-green-500',
  discard: 'bg-red-500/20 text-red-500',
  undecided: 'bg-gray-500/20 text-gray-300',
};

export function SongCard({ song, onChange, onDelete, onError, context }: Props) {
  const [fields, setFields] = useState({
    title: song.title ?? '',
    song_vibe: song.song_vibe ?? '',
    artist: song.artist,
    notes: song.notes ?? '',
  });

  // A different song (e.g. next in the review queue) resets the editable fields.
  useEffect(() => {
    setFields({ title: song.title ?? '', song_vibe: song.song_vibe ?? '', artist: song.artist, notes: song.notes ?? '' });
  }, [song.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (patch: SongEdit) => {
    try {
      await updateSong(song.id, patch);
      onChange({ ...song, ...patch } as Song);
    } catch (e) {
      onError((e as Error).message);
    }
  };

  const saveField = (key: 'title' | 'song_vibe' | 'artist' | 'notes') => {
    const current = (song[key] ?? '') as string;
    if (fields[key] === current) return;
    if (key === 'artist' && !fields.artist.trim()) {
      setFields(f => ({ ...f, artist: song.artist })); // artist is required
      return;
    }
    save({ [key]: fields[key].trim() || null } as SongEdit);
  };

  const remove = async () => {
    if (!confirm('Remove this song from the tool? (It stays in Suno.)')) return;
    try {
      await deleteSong(song.id);
      onDelete?.(song.id);
    } catch (e) {
      onError((e as Error).message);
    }
  };

  const decide = (decision: Decision) => save({ decision });

  const input = 'w-full px-3 py-2 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500';

  return (
    <div className="bg-gray-800 rounded-lg p-5 space-y-4 border border-gray-700">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {context && <div className="text-xs text-gray-500 truncate">{context}</div>}
          <div className="flex items-center gap-2 mt-1">
            <span className={`px-2 py-1 rounded-full text-xs ${DECISION_STYLE[song.decision]}`}>
              {song.decision === 'keep' ? 'Keep' : song.decision === 'discard' ? 'Discard' : 'Undecided'}
            </span>
            {song.music_track_id && (
              <span className="px-2 py-1 rounded-full text-xs bg-pink-500/20 text-pink-400">Published</span>
            )}
          </div>
        </div>
      </div>

      {/* Suno's audio is protected and cannot be played on other sites, so listening happens in Suno. */}
      {song.suno_url && (
        <a
          href={song.suno_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors font-medium"
        >
          <Headphones size={18} /> Listen in Suno <ExternalLink size={14} className="text-gray-400" />
        </a>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Title</label>
          <input
            value={fields.title}
            onChange={e => setFields(f => ({ ...f, title: e.target.value }))}
            onBlur={() => saveField('title')}
            className={input}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Song vibe (two words)</label>
          <input
            value={fields.song_vibe}
            onChange={e => setFields(f => ({ ...f, song_vibe: e.target.value }))}
            onBlur={() => saveField('song_vibe')}
            placeholder="e.g. Slow Rockabilly"
            className={input}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Artist</label>
          <input
            value={fields.artist}
            onChange={e => setFields(f => ({ ...f, artist: e.target.value }))}
            onBlur={() => saveField('artist')}
            className={input}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Notes</label>
          <input
            value={fields.notes}
            onChange={e => setFields(f => ({ ...f, notes: e.target.value }))}
            onBlur={() => saveField('notes')}
            placeholder="Why keep or discard?"
            className={input}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => decide('keep')}
          className={`px-4 py-2 rounded-lg flex items-center gap-1 transition-colors ${
            song.decision === 'keep' ? 'bg-green-600 text-white' : 'bg-gray-700 hover:bg-green-600/60'
          }`}
        >
          <Check size={16} /> Keep
        </button>
        <button
          onClick={() => decide('discard')}
          className={`px-4 py-2 rounded-lg flex items-center gap-1 transition-colors ${
            song.decision === 'discard' ? 'bg-red-600 text-white' : 'bg-gray-700 hover:bg-red-600/60'
          }`}
        >
          <X size={16} /> Discard
        </button>
        {song.decision !== 'undecided' && (
          <button
            onClick={() => decide('undecided')}
            className="px-3 py-2 rounded-lg flex items-center gap-1 text-sm text-gray-400 hover:text-white"
          >
            <Undo2 size={14} /> Undo
          </button>
        )}
        {onDelete && (
          <button onClick={remove} className="ml-auto inline-flex items-center gap-1 text-sm text-gray-500 hover:text-red-500">
            <Trash2 size={14} /> Remove
          </button>
        )}
      </div>
    </div>
  );
}
