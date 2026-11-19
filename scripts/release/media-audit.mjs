/** Media accessibility and offline controls in released HTML documents. */
import { finding, tokenizeHtml } from './site-audit.mjs';
import { resolveDownload } from './download-audit.mjs';

const MEDIA = new Set(['audio', 'video']);
const TRACK_KINDS = new Set(['captions', 'subtitles', 'descriptions', 'chapters', 'metadata']);
const AUDIO_EXT = new Set(['.mp3', '.ogg', '.wav', '.m4a', '.aac', '.flac']);
const VIDEO_EXT = new Set(['.mp4', '.webm', '.ogv', '.mov']);
const TRACK_EXT = new Set(['.vtt']);
const SRC_SET = /^(?:https?:)?\/\//i;
const LANGUAGE = /^(?:en|fr)(?:-[A-Za-z]{2,8})?$/;

function paired(source) {
  return typeof source === 'string' && source.trim().length > 0;
}

/** Gather media elements without relying on DOM or running scripts. */
export function mediaBlocks(html) {
  const blocks = [];
  const expression = /<(audio|video)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;
  for (const match of html.matchAll(expression)) {
    blocks.push({ type: match[1].toLowerCase(), source: match[0], children: match[3] });
  }
  return blocks;
}

export function mediaTracks(source) {
  return tokenizeHtml(source).filter((tag) => tag.name === 'track');
}

export function describeMedia(source) {
  const tags = tokenizeHtml(source);
  const root = tags.find((tag) => MEDIA.has(tag.name));
  if (!root) return null;
  const tracks = tags.filter((tag) => tag.name === 'track');
  const sources = tags.filter((tag) => tag.name === 'source');
  return {
    type: root.name,
    controls: Object.hasOwn(root.attrs, 'controls'),
    autoplay: Object.hasOwn(root.attrs, 'autoplay'),
    muted: Object.hasOwn(root.attrs, 'muted'),
    loop: Object.hasOwn(root.attrs, 'loop'),
    tracks,
    sources,
    root,
  };
}

const validLanguage = (value) => LANGUAGE.test(String(value ?? ''));

export function inspectMediaBlock(source, file = 'index.html', files = new Set(), number = 1) {
  const issues = [];
  const details = describeMedia(source);
  if (!details) return issues;
  const { root, tracks, sources, type } = details;
  const add = (code, detail) => issues.push(finding(code, file,
    `${type} ${number}: ${detail}`));
  if (details.autoplay) add('MEDIA_AUTOPLAY',
    'Autoplay media may start without an explicit user action');
  if (details.loop && !details.controls) add('MEDIA_LOOP',
    'Looping media needs user-operable playback controls');
  if (!details.controls) add('MEDIA_CONTROLS',
    'Media needs native controls in the offline artifact');
  if (root.attrs.preload === 'auto') add('MEDIA_PRELOAD',
    'Avoid automatically loading entire media files');
  if (root.attrs.src && sources.length) add('MEDIA_DUPLICATE_SOURCE',
    'Use either a media src or source children');
  if (root.attrs.src && SRC_SET.test(root.attrs.src)) add('MEDIA_REMOTE',
    'Media must be bundled locally');
  const references = root.attrs.src ? [root.attrs.src] : sources.map((tag) => tag.attrs.src);
  if (!references.length || references.every((reference) => !paired(reference))) {
    add('MEDIA_SOURCE', 'Media is missing a local source');
  }
  for (const ref of references) {
    if (!paired(ref)) { add('MEDIA_SOURCE', 'Source element has no src'); continue; }
    const result = resolveDownload(file, ref, files);
    if (result.kind !== 'local') {
      add('MEDIA_SOURCE_PATH', `Media source is ${result.kind}, not a shipped file`);
    } else {
      const extension = result.path.split('.').pop()?.toLowerCase();
      const set = type === 'audio' ? AUDIO_EXT : VIDEO_EXT;
      if (!set.has(`.${extension}`)) add('MEDIA_FORMAT',
        'Media source has an unexpected format');
    }
  }
  const captions = new Set();
  const descriptions = new Set();
  for (const track of tracks) {
    const kind = (track.attrs.kind ?? 'subtitles').toLowerCase();
    if (!TRACK_KINDS.has(kind)) add('MEDIA_TRACK_KIND',
      `Unknown track kind: ${kind}`);
    if (kind === 'captions' || kind === 'subtitles') {
      if (!validLanguage(track.attrs.srclang)) {
        add('MEDIA_TRACK_LANGUAGE', 'Caption/subtitle track needs EN or FR language');
      } else captions.add(track.attrs.srclang.slice(0, 2).toLowerCase());
    }
    if (kind === 'descriptions') {
      if (validLanguage(track.attrs.srclang)) {
        descriptions.add(track.attrs.srclang.slice(0, 2).toLowerCase());
      } else add('MEDIA_DESCRIPTION_LANGUAGE', 'Description track needs EN or FR language');
    }
    if (!paired(track.attrs.src)) { add('MEDIA_TRACK_SOURCE', 'Track has no src'); continue; }
    const path = resolveDownload(file, track.attrs.src, files);
    if (path.kind !== 'local') add('MEDIA_TRACK_PATH',
      `Media track is ${path.kind}, not a shipped file`);
    else if (!TRACK_EXT.has(`.${path.path.split('.').pop()?.toLowerCase()}`)) {
      add('MEDIA_TRACK_FORMAT', 'Caption track must be WebVTT');
    }
  }
  if (type === 'video') {
    for (const lang of ['en', 'fr']) {
      if (!captions.has(lang)) add('MEDIA_CAPTIONS',
        `Video needs a ${lang.toUpperCase()} caption or subtitle track`);
    }
    if (!paired(root.attrs['aria-label']) && !paired(root.attrs.title)) {
      add('MEDIA_NAME', 'Video needs an accessible name');
    }
    if (root.attrs.poster) {
      const poster = resolveDownload(file, root.attrs.poster, files);
      if (poster.kind !== 'local') add('MEDIA_POSTER',
        'Poster must be bundled locally');
    }
  }
  return issues;
}

export function inspectHtmlMedia(html, file = 'index.html', files = new Set()) {
  const issues = [];
  const blocks = mediaBlocks(html);
  for (const [index, block] of blocks.entries()) {
    issues.push(...inspectMediaBlock(block.source, file, files, index + 1));
  }
  for (const tag of tokenizeHtml(html)) {
    if (!MEDIA.has(tag.name)) continue;
    const count = (html.match(new RegExp(`<${tag.name}\\b`, 'gi')) ?? []).length;
    const found = blocks.filter((block) => block.type === tag.name).length;
    if (count > found) {
      issues.push(finding('MEDIA_UNCLOSED', file,
        `Incomplete ${tag.name} markup`));
      break;
    }
  }
  return issues;
}

/** Basic WebVTT structural checks; not a cue readability or timing assessment. */
export function inspectWebVtt(text, file = 'captions.vtt') {
  const issues = [];
  if (!/^\uFEFF?WEBVTT(?:[ \t].*)?(?:\r?\n|$)/.test(text)) {
    issues.push(finding('MEDIA_VTT_HEADER', file, 'Caption file must begin with WEBVTT'));
    return issues;
  }
  const cues = [...text.matchAll(/(\d{2}:)?\d{2}:\d{2}\.\d{3}\s+-->\s+(\d{2}:)?\d{2}:\d{2}\.\d{3}/g)];
  if (!cues.length) issues.push(finding('MEDIA_VTT_CUES', file,
    'Caption file has no timed cues'));
  if (/<script\b/i.test(text)) issues.push(finding('MEDIA_VTT_SCRIPT', file,
    'Caption text must not contain executable markup'));
  return issues;
}
