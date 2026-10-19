import { adminClient, json, requireFactoryUser } from './_lib/auth.mts';
import { resolveShareLink } from './_lib/suno.mts';

const MAX_LINKS = 20;

// Browsers cannot read another site's redirect, so share links (suno.com/s/...) are resolved here.
// Body: { urls: string[] }  ->  { resolved: { [url]: songId }, failed: string[] }
export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let admin;
  try {
    admin = adminClient();
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
  const auth = await requireFactoryUser(req, admin);
  if ('error' in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const urls: unknown = body?.urls;
  if (!Array.isArray(urls) || urls.some(u => typeof u !== 'string') || urls.length > MAX_LINKS) {
    return json({ error: `urls must be a list of at most ${MAX_LINKS} strings` }, 400);
  }

  const resolved: Record<string, string> = {};
  const failed: string[] = [];
  await Promise.all(
    (urls as string[]).map(async url => {
      const id = await resolveShareLink(url);
      if (id) resolved[url] = id;
      else failed.push(url);
    })
  );
  return json({ resolved, failed });
};
