import { Loader2 } from 'lucide-react';
import type { JobStatus } from '../lib/types';

const STYLES: Record<JobStatus, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'bg-gray-500/20 text-gray-300' },
  generating: { label: 'Generating…', cls: 'bg-blue-500/20 text-blue-400' },
  prompt_ready: { label: 'Prompt ready', cls: 'bg-green-500/20 text-green-500' },
  queued: { label: 'Queued', cls: 'bg-yellow-500/20 text-yellow-500' },
  suno_generating: { label: 'In Suno', cls: 'bg-purple-500/20 text-purple-400' },
  done: { label: 'Done', cls: 'bg-pink-500/20 text-pink-400' },
  failed: { label: 'Failed', cls: 'bg-red-500/20 text-red-500' },
};

export function StatusBadge({ status }: { status: JobStatus }) {
  const { label, cls } = STYLES[status] ?? STYLES.draft;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${cls}`}>
      {status === 'generating' && <Loader2 size={12} className="animate-spin" />}
      {label}
    </span>
  );
}
