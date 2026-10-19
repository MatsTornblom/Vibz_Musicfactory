import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Sparkles } from 'lucide-react';
import { createJob, getBatch, listJobs, startGeneration } from '../lib/api';
import type { Batch, Job } from '../lib/types';
import { StatusBadge } from './StatusBadge';

export function BatchDetail() {
  const { batchId = '' } = useParams();
  const navigate = useNavigate();
  const [batch, setBatch] = useState<Batch | null>(null);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [style, setStyle] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(
    () => listJobs(batchId).then(setJobs).catch(e => setError(e.message)),
    [batchId]
  );

  useEffect(() => {
    getBatch(batchId).then(setBatch).catch(e => setError(e.message));
    reload();
  }, [batchId, reload]);

  // Keep the list fresh while something is being generated.
  const anyGenerating = jobs?.some(j => j.status === 'generating') ?? false;
  useEffect(() => {
    if (!anyGenerating) return;
    const t = setInterval(reload, 3000);
    return () => clearInterval(t);
  }, [anyGenerating, reload]);

  const submit = async (generate: boolean) => {
    if (!style.trim() || !text.trim()) {
      setError('Fill in both Stil and Text.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const job = await createJob(batchId, style, text);
      if (generate) {
        try {
          await startGeneration(job.id);
        } catch (e) {
          setError(`Brief saved, but generation did not start: ${(e as Error).message}`);
          await reload();
          setBusy(false);
          return;
        }
      }
      navigate(`/jobs/${job.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white">
        <ArrowLeft size={16} /> All folders
      </Link>
      <h1 className="text-3xl font-bold">{batch?.name ?? '…'}</h1>

      {error && <div className="bg-red-500/10 text-red-500 px-4 py-2 rounded-lg">{error}</div>}

      <div className="bg-gray-800 rounded-lg p-6 space-y-4 max-w-3xl">
        <h2 className="text-xl font-semibold">New brief</h2>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Stil: genre, mood, instrumentation, artist references for the vibe</label>
          <textarea
            value={style}
            onChange={e => setStyle(e.target.value)}
            rows={3}
            placeholder="t.ex. en låt i stil med Prince, funkig, sparsmakad, falsett"
            className="w-full px-4 py-2 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Text: lyric theme, emotional tone, specific phrases</label>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={3}
            placeholder="t.ex. att dela en bra dag med någon man tycker om"
            className="w-full px-4 py-2 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
          />
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => submit(true)}
            disabled={busy}
            className="px-4 py-2 bg-pink-500 rounded-lg hover:bg-pink-600 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />} Create and generate
          </button>
          <button
            onClick={() => submit(false)}
            disabled={busy}
            className="px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50"
          >
            Save as draft
          </button>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg overflow-hidden">
        {jobs === null ? (
          <div className="p-6 text-gray-400 flex items-center gap-2"><Loader2 size={18} className="animate-spin" /> Loading…</div>
        ) : jobs.length === 0 ? (
          <div className="p-6 text-gray-400">No briefs in this folder yet.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-700 text-left text-sm font-medium">
                <th className="px-6 py-3">Brief</th>
                <th className="px-6 py-3">Title</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {jobs.map(j => (
                <tr key={j.id} className="hover:bg-gray-700/50">
                  <td className="px-6 py-4 max-w-md">
                    <Link to={`/jobs/${j.id}`} className="text-pink-400 hover:underline block truncate">{j.brief_style}</Link>
                    {j.regen_note && <span className="text-xs text-gray-500">Regenerated: {j.regen_note}</span>}
                  </td>
                  <td className="px-6 py-4">{j.title ?? <span className="text-gray-500">—</span>}</td>
                  <td className="px-6 py-4"><StatusBadge status={j.status} /></td>
                  <td className="px-6 py-4 text-gray-400">{new Date(j.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
