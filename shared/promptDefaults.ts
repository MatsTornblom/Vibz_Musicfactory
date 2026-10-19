// Shared by the browser (Settings screen) and the Netlify functions (generation).
// Keep this file free of Node/DOM-only APIs.

export const SETTING_KEYS = {
  prompt: 'prompt',
  model: 'openai_model',
} as const;

// Which OpenAI model to use when none is saved in Settings. The curator can change it in
// Settings; OpenAI model names change over time, so this is only a starting point.
export const DEFAULT_MODEL = 'gpt-4o';

// Suno style prompts are limited to this many characters (enforced in code, not by the AI).
export const STYLE_PROMPT_MAX = 300;

// The creative part of the prompt. Fully editable by the curator in Settings.
export const DEFAULT_PROMPT = `You are a professional Music Producer and Prompt Engineer specializing in Suno AI, creating music for Vibz, a social platform built around love, empathy and good vibes. Songs are attached to user messages inside the app, so they need to feel like something: emotionally resonant, stylistically distinct and fun to discover.

The brief may be written in Swedish. All output is in English.

Style prompt rules:
- Comma-separated descriptive tags.
- Include genre, sub-genre, tempo, mood, instrumentation and vocal texture.
- Never mention artist names. Translate any artist reference into descriptors of sound, era and feel.

Lyrics rules:
- Full lyrics with Suno structural tags: [Intro] [Verse] [Chorus] [Bridge] [Outro] etc.
- Vocal cues where useful: [Male Vocal] [Female Vocal] [Whispered] [Ad-lib].
- Match the lyric style to the genre.

Vibz brand context:
- Themes: connection, love, empathy, nature, being present, good energy.
- Tone: warm, inclusive, slightly mystical, human.
- Avoid: aggression, nihilism, explicit content.`;

// The fixed part. Appended to the prompt on every call so the app can always read the result.
// Shown read-only in Settings so nothing is hidden. Not editable.
export const OUTPUT_CONTRACT = `Respond only with the structured fields:
- style_prompt: the Suno style prompt, at most ${STYLE_PROMPT_MAX} characters.
- lyrics: the full lyrics with structure tags.
- title: a short, fitting song title.
- song_vibe: a two-word human description of the song's feel, for example "Slow Rockabilly".

If you are given a previous version together with a requested change, apply the change and keep everything else as close to the previous version as possible.`;

export interface GenerationInput {
  brief_style: string;
  brief_text: string;
  previous?: { style_prompt: string | null; lyrics: string | null; title: string | null };
  regen_note?: string | null;
}

export interface GenerationOutput {
  style_prompt: string;
  lyrics: string;
  title: string;
  song_vibe: string;
}

/** The user message sent to the model: the brief, plus the previous version when regenerating. */
export function buildUserMessage(input: GenerationInput): string {
  let msg = `Stil: ${input.brief_style.trim()}\nText: ${input.brief_text.trim()}`;
  if (input.previous && input.regen_note?.trim()) {
    msg +=
      `\n\nPrevious version:\nStyle prompt: ${input.previous.style_prompt ?? ''}\n` +
      `Title: ${input.previous.title ?? ''}\nLyrics:\n${input.previous.lyrics ?? ''}` +
      `\n\nRequested change: ${input.regen_note.trim()}`;
  }
  return msg;
}

/** JSON schema for OpenAI structured outputs (strict mode). */
export const OUTPUT_SCHEMA = {
  name: 'suno_song_prompt',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['style_prompt', 'lyrics', 'title', 'song_vibe'],
    properties: {
      style_prompt: { type: 'string' },
      lyrics: { type: 'string' },
      title: { type: 'string' },
      song_vibe: { type: 'string' },
    },
  },
} as const;

/**
 * Suno's style box is limited, and the model sometimes overshoots. Cut at the last comma that
 * fits (tags are comma-separated, so this never leaves half a tag); hard-cut as a last resort.
 */
export function clampStylePrompt(text: string, max = STYLE_PROMPT_MAX): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastComma = cut.lastIndexOf(',');
  return (lastComma > 0 ? cut.slice(0, lastComma) : cut).trim();
}
