import { adminClient, json, requireFactoryUser } from './_lib/auth.mts';

// Quick, synchronous front door: checks the caller, marks the job as generating and hands the
// slow OpenAI call to the background function (which can run for minutes). Doing the auth here
// means the browser sees a real 401/403 — a background function always answers 202.
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
  const jobId = body?.job_id;
  if (typeof jobId !== 'string') return json({ error: 'job_id required' }, 400);

  const { data: job } = await admin.from('mf_jobs').select('id,status').eq('id', jobId).maybeSingle();
  if (!job) return json({ error: 'Job not found' }, 404);
  if (!process.env.OPENAI_API_KEY) return json({ error: 'Server is missing OPENAI_API_KEY' }, 500);

  await admin.from('mf_jobs').update({ status: 'generating', error: null }).eq('id', jobId);

  const bgUrl = new URL('/.netlify/functions/generate-prompt-background', req.url);
  const res = await fetch(bgUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: req.headers.get('authorization') ?? '' },
    body: JSON.stringify({ job_id: jobId }),
  });
  if (res.status !== 202) {
    await admin
      .from('mf_jobs')
      .update({ status: 'failed', error: `Could not start generation (HTTP ${res.status})` })
      .eq('id', jobId);
    return json({ error: 'Could not start generation' }, 502);
  }

  return json({ ok: true }, 202);
};
