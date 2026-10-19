// Helpers for Suno song links. Shared by the browser and (later) the publish function.
// No network access here: we only derive URLs from a song's id.

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID_RE = new RegExp(UUID, 'i');

/**
 * Pull the song id out of whatever the curator pasted: a suno.com/song/<id> link, a
 * cdn1.suno.ai/<id>.mp3 link, or the bare id. Returns null when there is no id to find
 * (for example a short suno.com/s/... share link, which only Suno can resolve).
 */
export function parseSunoSongId(input: string): string | null {
  const m = input.trim().match(UUID_RE);
  return m ? m[0].toLowerCase() : null;
}

/** Split pasted text (one link per line, or separated by spaces/commas) into distinct song ids. */
export function parseSunoLinks(text: string): { ids: string[]; unrecognised: string[] } {
  const ids: string[] = [];
  const unrecognised: string[] = [];
  for (const part of text.split(/[\s,;]+/).filter(Boolean)) {
    const id = parseSunoSongId(part);
    if (id) {
      if (!ids.includes(id)) ids.push(id);
    } else {
      unrecognised.push(part);
    }
  }
  return { ids, unrecognised };
}

export const sunoSongUrl = (id: string) => `https://suno.com/song/${id}`;
export const sunoAudioUrl = (id: string) => `https://cdn1.suno.ai/${id}.mp3`;
