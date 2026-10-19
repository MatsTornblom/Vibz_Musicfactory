import { normaliseSunoShareLink, parseSunoSongId } from '../../../shared/suno.ts';

type FetchLike = typeof fetch;

/**
 * Turn a Suno share link (suno.com/s/<code>) into the song id by reading where it redirects.
 * Only exact suno.com/s/<code> links are followed (normaliseSunoShareLink), and the redirect is
 * read but never followed, so this cannot be used to make the server visit other sites.
 * One light request per link, made only when the curator pastes it.
 */
export async function resolveShareLink(url: string, fetchImpl: FetchLike = fetch): Promise<string | null> {
  const safe = normaliseSunoShareLink(url);
  if (!safe) return null;
  try {
    const res = await fetchImpl(safe, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
    });
    // Free the connection without reading the page body.
    res.body?.cancel().catch(() => {});
    const location = res.headers.get('location');
    return location ? parseSunoSongId(location) : null;
  } catch {
    return null;
  }
}
