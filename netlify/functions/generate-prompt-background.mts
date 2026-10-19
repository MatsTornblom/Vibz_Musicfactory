import { adminClient, json, requireFactoryUser } from './_lib/auth.mts';
import { runGeneration } from './_lib/generate.mts';

// Netlify runs functions named "*-background" asynchronously (up to 15 minutes) and answers the
// caller with 202 straight away. The result is written to the job row; the UI watches it.
// Re-checks the caller itself: this URL is public, so it must not trust being called by us.
export default async (req: Request): Promise<Response> => {
  const admin = adminClient();
  const auth = await requireFactoryUser(req, admin);
  if ('error' in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const jobId = body?.job_id;
  const apiKey = process.env.OPENAI_API_KEY;
  if (typeof jobId !== 'string' || !apiKey) return json({ error: 'Bad request' }, 400);

  await runGeneration(admin, jobId, { apiKey });
  return json({ ok: true });
};
