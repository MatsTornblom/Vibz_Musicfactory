// Helpers for Suno song links. Shared by the browser and the Netlify functions.
// No network access here: we only read ids out of text and build page URLs.

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID_RE = new RegExp(UUID, 'i');

// Suno's Share button gives https://suno.com/s/<code>, which redirects to /song/<id>.
// Strict on purpose: the server resolves these, so nothing but this exact shape may pass.
const SHARE_LINK_RE = /^https?:\/\/(?:www\.)?suno\.com\/s\/([A-Za-z0-9_-]{4,64})\/?(?:\?[^\s#]*)?(?:#\S*)?$/i;

/**
 * Pull the song id out of whatever the curator pasted: a suno.com/song/<id> link or the bare
 * id. Returns null when there is no id in the text (for example a short suno.com/s/ link,
 * which only Suno can resolve; see isSunoShareLink).
 */
export function parseSunoSongId(input: string): string | null {
  const m = input.trim().match(UUID_RE);
  return m ? m[0].toLowerCase() : null;
}

/** A Suno "share" short link. Returns the normalised URL, or null if it is not one. */
export function normaliseSunoShareLink(input: string): string | null {
  const m = input.trim().match(SHARE_LINK_RE);
  return m ? `https://suno.com/s/${m[1]}` : null;
}

export interface ParsedLinks {
  ids: string[];
  /** Short share links whose song id must be looked up (done by a server function). */
  shareLinks: string[];
  unrecognised: string[];
}

/** Split pasted text (one link per line, or separated by spaces/commas) into what we can use. */
export function parseSunoLinks(text: string): ParsedLinks {
  const out: ParsedLinks = { ids: [], shareLinks: [], unrecognised: [] };
  for (const part of text.split(/[\s,;]+/).filter(Boolean)) {
    const id = parseSunoSongId(part);
    const share = id ? null : normaliseSunoShareLink(part);
    if (id) {
      if (!out.ids.includes(id)) out.ids.push(id);
    } else if (share) {
      if (!out.shareLinks.includes(share)) out.shareLinks.push(share);
    } else {
      out.unrecognised.push(part);
    }
  }
  return out;
}

export const sunoSongUrl = (id: string) => `https://suno.com/song/${id}`;
