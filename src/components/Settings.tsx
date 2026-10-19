import { useEffect, useState } from 'react';
import { Loader2, RotateCcw, Save } from 'lucide-react';
import { DEFAULT_MODEL, DEFAULT_PROMPT, OUTPUT_CONTRACT } from '../../shared/promptDefaults';
import { loadSettings, saveSettings, type FactorySettings } from '../lib/api';

export function Settings() {
  const [saved, setSaved] = useState<FactorySettings | null>(null);
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    loadSettings()
      .then(s => {
        setSaved(s);
        setPrompt(s.prompt);
        setModel(s.model);
      })
      .catch(e => setMessage({ ok: false, text: e.message }));
  }, []);

  const dirty = saved !== null && (prompt !== saved.prompt || model !== saved.model);

  const save = async () => {
    if (!prompt.trim() || !model.trim()) {
      setMessage({ ok: false, text: 'The prompt and the model name cannot be empty.' });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await saveSettings({ prompt, model });
      setSaved({ prompt, model: model.trim() });
      setMessage({ ok: true, text: 'Saved. New generations use these settings.' });
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    if (!confirm('Replace the prompt text below with the original default? Nothing is saved until you press Save.')) return;
    setPrompt(DEFAULT_PROMPT);
  };

  if (!saved && !message) {
    return <div className="text-gray-400 flex items-center gap-2"><Loader2 size={18} className="animate-spin" /> Loading…</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-3xl font-bold">Settings</h1>

      {message && (
        <div className={`px-4 py-2 rounded-lg ${message.ok ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
          {message.text}
        </div>
      )}

      <div className="bg-gray-800 rounded-lg p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Prompt-creator prompt</h2>
          <button onClick={reset} className="inline-flex items-center gap-1 text-sm text-gray-300 hover:text-white">
            <RotateCcw size={14} /> Reset to default
          </button>
        </div>
        <p className="text-sm text-gray-400">
          Instructions for the AI that turns what you write (Stil and Text) into a Suno style prompt and lyrics. Change anything: tone, rules,
          what to avoid. The fixed part below is added automatically.
        </p>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          rows={22}
          className="w-full px-4 py-3 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 font-mono text-sm"
        />
      </div>

      <div className="bg-gray-800 rounded-lg p-6 space-y-3">
        <h2 className="text-xl font-semibold">Fixed part (added automatically, read-only)</h2>
        <p className="text-sm text-gray-400">
          This makes sure the app always gets style prompt, lyrics, title and song vibe back as separate fields. It is
          not part of the prompt above, so editing the prompt cannot break it. What you write is sent as
          &ldquo;Stil: …&rdquo; and &ldquo;Text: …&rdquo;.
        </p>
        <pre className="whitespace-pre-wrap bg-gray-900 rounded-lg p-4 text-sm text-gray-400">{OUTPUT_CONTRACT}</pre>
      </div>

      <div className="bg-gray-800 rounded-lg p-6 space-y-3">
        <h2 className="text-xl font-semibold">OpenAI model</h2>
        <p className="text-sm text-gray-400">
          The model name exactly as OpenAI's API calls it. It must support structured outputs. Default: {DEFAULT_MODEL}.
          If generation fails with &ldquo;model not found&rdquo;, change it here.
        </p>
        <input
          value={model}
          onChange={e => setModel(e.target.value)}
          className="w-full max-w-sm px-4 py-2 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
        />
      </div>

      <button
        onClick={save}
        disabled={busy || !dirty}
        className="px-6 py-2 bg-pink-500 rounded-lg hover:bg-pink-600 transition-colors flex items-center gap-2 disabled:opacity-50"
      >
        {busy ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Save settings
      </button>
    </div>
  );
}
