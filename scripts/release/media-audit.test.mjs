import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  mediaBlocks, mediaTracks, describeMedia,
  inspectHtmlMedia, inspectWebVtt,
} from './media-audit.mjs';

const inventory = new Set(['index.html', 'video.mp4', 'audio.mp3', 'en.vtt', 'fr.vtt', 'poster.png']);
const video = (attrs = '', tracks = '<track kind="captions" srclang="en" src="en.vtt"><track kind="subtitles" srclang="fr" src="fr.vtt">') =>
  `<video controls title="Instructions" src="video.mp4" ${attrs}>${tracks}</video>`;
const audio = (attrs = '') => `<audio controls src="audio.mp3" ${attrs}></audio>`;
const has = (issues, code) => assert.ok(issues.some((issue) => issue.code === code),
  `Expected ${code}: ${JSON.stringify(issues)}`);
const clean = (source) => assert.deepEqual(inspectHtmlMedia(source, 'index.html', inventory), []);

describe('media extraction', () => {
  it('returns empty blocks for no media', () => assert.deepEqual(mediaBlocks('<p>Hello</p>'), []));
  it('finds video blocks', () => assert.equal(mediaBlocks(video()).length, 1));
  it('finds audio blocks', () => assert.equal(mediaBlocks(audio()).length, 1));
  it('distinguishes media types', () => assert.deepEqual(mediaBlocks(audio() + video()).map((item) => item.type), ['audio', 'video']));
  it('extracts two caption tracks', () => assert.equal(mediaTracks(video()).length, 2));
  it('returns no track for audio', () => assert.equal(mediaTracks(audio()).length, 0));
  it('describes media controls', () => assert.equal(describeMedia(video()).controls, true));
  it('describes media sources', () => assert.equal(describeMedia(video()).root.attrs.src, 'video.mp4'));
  it('does not describe non-media', () => assert.equal(describeMedia('<div/>'), null));
});

describe('accessible audio exports', () => {
  it('accepts local audio with controls', () => clean(audio()));
  it('rejects autoplay', () => has(inspectHtmlMedia(audio('autoplay'), 'index.html', inventory), 'MEDIA_AUTOPLAY'));
  it('rejects media without controls', () => has(inspectHtmlMedia('<audio src="audio.mp3"></audio>', 'index.html', inventory), 'MEDIA_CONTROLS'));
  it('rejects looping without controls', () => has(inspectHtmlMedia('<audio src="audio.mp3" loop></audio>', 'index.html', inventory), 'MEDIA_LOOP'));
  it('accepts looping with controls', () => clean(audio('loop')));
  it('rejects preload auto', () => has(inspectHtmlMedia(audio('preload="auto"'), 'index.html', inventory), 'MEDIA_PRELOAD'));
  it('accepts preload metadata', () => clean(audio('preload="metadata"')));
  it('rejects absent source', () => has(inspectHtmlMedia('<audio controls></audio>', 'index.html', inventory), 'MEDIA_SOURCE'));
  it('rejects remote sources', () => has(inspectHtmlMedia('<audio controls src="https://example.org/sound.mp3"></audio>', 'index.html', inventory), 'MEDIA_SOURCE_PATH'));
  it('rejects unshipped sources', () => has(inspectHtmlMedia('<audio controls src="missing.mp3"></audio>', 'index.html', inventory), 'MEDIA_SOURCE_PATH'));
  it('rejects an HTML file as audio', () => has(inspectHtmlMedia('<audio controls src="index.html"></audio>', 'index.html', inventory), 'MEDIA_FORMAT'));
  it('accepts audio source elements', () => clean('<audio controls><source src="audio.mp3" type="audio/mpeg"></audio>'));
  it('rejects duplicate source styles', () => has(inspectHtmlMedia('<audio controls src="audio.mp3"><source src="audio.mp3"></audio>', 'index.html', inventory), 'MEDIA_DUPLICATE_SOURCE'));
});

describe('captioned video', () => {
  it('accepts EN/FR captions and local video', () => clean(video()));
  it('accepts local poster', () => clean(video('poster="poster.png"')));
  it('rejects missing English caption track', () => has(inspectHtmlMedia(video('', '<track kind="captions" srclang="fr" src="fr.vtt">'), 'index.html', inventory), 'MEDIA_CAPTIONS'));
  it('rejects missing French caption track', () => has(inspectHtmlMedia(video('', '<track kind="captions" srclang="en" src="en.vtt">'), 'index.html', inventory), 'MEDIA_CAPTIONS'));
  it('rejects unnamed video', () => has(inspectHtmlMedia(video().replace('title="Instructions"', ''), 'index.html', inventory), 'MEDIA_NAME'));
  it('accepts an aria-label', () => clean(video('aria-label="Video"').replace('title="Instructions"', '')));
  it('rejects external poster', () => has(inspectHtmlMedia(video('poster="https://example.org/cover.png"'), 'index.html', inventory), 'MEDIA_POSTER'));
  it('rejects invalid track kind', () => has(inspectHtmlMedia(video('', '<track kind="unknown" src="en.vtt">'), 'index.html', inventory), 'MEDIA_TRACK_KIND'));
  it('rejects invalid caption language', () => has(inspectHtmlMedia(video('', '<track kind="captions" srclang="de" src="en.vtt">'), 'index.html', inventory), 'MEDIA_TRACK_LANGUAGE'));
  it('rejects a caption without src', () => has(inspectHtmlMedia(video('', '<track kind="captions" srclang="en">'), 'index.html', inventory), 'MEDIA_TRACK_SOURCE'));
  it('rejects a remote caption track', () => has(inspectHtmlMedia(video('', '<track kind="captions" srclang="en" src="https://example.org/en.vtt">'), 'index.html', inventory), 'MEDIA_TRACK_PATH'));
  it('rejects a missing caption file', () => has(inspectHtmlMedia(video('', '<track kind="captions" srclang="en" src="missing.vtt">'), 'index.html', inventory), 'MEDIA_TRACK_PATH'));
  it('rejects invalid caption format', () => has(inspectHtmlMedia(video('', '<track kind="captions" srclang="en" src="index.html">'), 'index.html', inventory), 'MEDIA_TRACK_FORMAT'));
  it('rejects an unclosed video element', () => has(inspectHtmlMedia('<video controls src="video.mp4">', 'index.html', inventory), 'MEDIA_UNCLOSED'));
  it('accepts video source child', () => clean('<video controls title="Video"><source src="video.mp4"><track kind="captions" srclang="en" src="en.vtt"><track kind="captions" srclang="fr" src="fr.vtt"></video>'));
  it('rejects language-less descriptions', () => has(inspectHtmlMedia(video('', '<track kind="descriptions" src="en.vtt">'), 'index.html', inventory), 'MEDIA_DESCRIPTION_LANGUAGE'));
});

describe('WebVTT transport structure', () => {
  const valid = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nWelcome';
  it('accepts timed captions', () => assert.deepEqual(inspectWebVtt(valid), []));
  it('accepts an optional description', () => assert.deepEqual(inspectWebVtt('WEBVTT - English\n\n00:00:01.000 --> 00:00:02.000\nWelcome'), []));
  it('accepts BOM', () => assert.deepEqual(inspectWebVtt('\uFEFF' + valid), []));
  it('rejects a missing header', () => has(inspectWebVtt('00:00:01.000 --> 00:00:02.000'), 'MEDIA_VTT_HEADER'));
  it('rejects a file without cues', () => has(inspectWebVtt('WEBVTT\n\nNo cues'), 'MEDIA_VTT_CUES'));
  it('rejects script markup', () => has(inspectWebVtt(valid + '\n<script>bad()</script>'), 'MEDIA_VTT_SCRIPT'));
  it('preserves reported file name', () => assert.equal(inspectWebVtt('bad', 'fr.vtt')[0].file, 'fr.vtt'));
});
