import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import { createBatch, listBatches, type BatchWithCount } from '../lib/api';

export function Batches() {
  const navigate = useNavigate();
  const [batches, setBatches] = useState<BatchWithCount[] | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listBatches().then(setBatches).catch(e => setError(e.message));
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const batch = await createBatch(name.trim());
      navigate(`/folders/${batch.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Folders</h1>
      <p className="text-gray-400 max-w-2xl">
        A folder groups song briefs, for example one theme or one round of generating. Open a folder to add briefs.
      </p>

      {error && <div className="bg-red-500/10 text-red-500 px-4 py-2 rounded-lg">{error}</div>}

      <form onSubmit={create} className="flex gap-3 max-w-xl">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="New folder name, e.g. 80s pop round 1"
          className="flex-1 px-4 py-2 bg-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
        />
        <button
          disabled={busy || !name.trim()}
          className="px-4 py-2 bg-pink-500 rounded-lg hover:bg-pink-600 transition-colors flex items-center gap-2 disabled:opacity-50"
        >
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />} Create folder
        </button>
      </form>

      <div className="bg-gray-800 rounded-lg overflow-hidden">
        {batches === null ? (
          <div className="p-6 text-gray-400 flex items-center gap-2"><Loader2 size={18} className="animate-spin" /> Loading…</div>
        ) : batches.length === 0 ? (
          <div className="p-6 text-gray-400">No folders yet. Create your first one above.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-700 text-left text-sm font-medium">
                <th className="px-6 py-3">Name</th>
                <th className="px-6 py-3">Briefs</th>
                <th className="px-6 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {batches.map(b => (
                <tr key={b.id} className="hover:bg-gray-700/50">
                  <td className="px-6 py-4">
                    <Link to={`/folders/${b.id}`} className="text-pink-400 hover:underline font-medium">{b.name}</Link>
                  </td>
                  <td className="px-6 py-4">{b.job_count}</td>
                  <td className="px-6 py-4 text-gray-400">{new Date(b.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
