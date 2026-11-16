/** Cross-language media caption timing consistency checks. */
import { finding, tokenizeHtml } from './site-audit.mjs';
import { mediaBlocks, describeMedia } from './media-audit.mjs';
import { resolveDownload } from './download-audit.mjs';

const CUE_TIME = /^(?:(\d{2}):)?(\d{2}):(\d{2})\.(\d{3})$/;
const CUE_LINE = /^\s*((?:\d{2}:)?\d{2}:\d{2}\.\d{3})\s+-->\s+((?:\d{2}:)?\d{2}:\d{2}\.\d{3})(?:\s|$)/;

export function cueMillis(text) {
  const match = CUE_TIME.exec(text);
  if (!match) return null;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const millis = Number(match[4]);
  if (minutes > 59 || seconds > 59) return null;
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis;
}

/** Extract timed cues without changing subtitle or description text. */
export function parseCaptionCues(text) {
  if (typeof text !== 'string' || !text.startsWith('WEBVTT')) {
    return { cues: [], errors: ['header'] };
  }
  const cues = [];
  const errors = [];
  const blocks = text.replace(/\r\n?/g, '\n').split(/\n\s*\n/).slice(1);
  for (const [index, block] of blocks.entries()) {
    const lines = block.split('\n');
    const timing = lines.find((line) => line.includes('-->'));
    if (!timing) continue;
    const match = CUE_LINE.exec(timing);
    if (!match) { errors.push(`cue ${index + 1} timing`); continue; }
    const start = cueMillis(match[1]);
    const end = cueMillis(match[2]);
    if (start === null || end === null || start >= end) {
      errors.push(`cue ${index + 1} range`);
      continue;
    }
    const content = lines.slice(lines.indexOf(timing) + 1).join('\n').trim();
    if (!content) errors.push(`cue ${index + 1} text`);
    if (cues.length && start < cues.at(-1).start) {
      errors.push(`cue ${index + 1} ordering`);
    }
    cues.push({ start, end });
  }
  return { cues, errors };
}

export function compareCaptionCues(english, french, file = 'index.html') {
  const issues = [];
  const en = parseCaptionCues(english);
  const fr = parseCaptionCues(french);
  if (en.errors.length || fr.errors.length) {
    issues.push(finding('CAPTION_CUE_PARSE', file,
      'Caption timing or text contains malformed cues'));
    return issues;
  }
  if (en.cues.length !== fr.cues.length) {
    issues.push(finding('CAPTION_CUE_COUNT', file,
      `EN has ${en.cues.length} cues, FR has ${fr.cues.length}`));
    return issues;
  }
  for (let index = 0; index < en.cues.length; index += 1) {
    const a = en.cues[index];
    const b = fr.cues[index];
    if (Math.abs(a.start - b.start) > 500 || Math.abs(a.end - b.end) > 500) {
      issues.push(finding('CAPTION_CUE_ALIGNMENT', file,
        `EN/FR caption timing differs at cue ${index + 1}`));
    }
  }
  return issues;
}

/** Accepts a local inventory of already-decoded WebVTT files; no fetching. */
export function inspectBilingualCaptions(html, file, captions) {
  const issues = [];
  for (const [index, block] of mediaBlocks(html).entries()) {
    const media = describeMedia(block.source);
    if (media?.type !== 'video') continue;
    const paired = new Map();
    for (const track of media.tracks) {
      const kind = (track.attrs.kind ?? 'subtitles').toLowerCase();
      if (!['captions', 'subtitles'].includes(kind)) continue;
      const language = (track.attrs.srclang ?? '').slice(0, 2).toLowerCase();
      if (!['en', 'fr'].includes(language)) continue;
      const reference = resolveDownload(file, track.attrs.src, new Set(captions.keys()));
      if (reference.kind !== 'local') continue;
      const fileText = captions.get(reference.path);
      if (fileText !== undefined) paired.set(language, fileText);
    }
    if (paired.has('en') && paired.has('fr')) {
      issues.push(...compareCaptionCues(paired.get('en'), paired.get('fr'),
        `${file} video ${index + 1}`));
    }
  }
  return issues;
}
