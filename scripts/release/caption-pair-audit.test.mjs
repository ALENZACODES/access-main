import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cueMillis, parseCaptionCues, compareCaptionCues, inspectBilingualCaptions } from './caption-pair-audit.mjs';

const en = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nWelcome\n\n00:00:03.000 --> 00:00:04.000\nNext';
const fr = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nBienvenue\n\n00:00:03.000 --> 00:00:04.000\nSuivant';
const video = '<video controls title="Guide" src="video.mp4"><track kind="captions" srclang="en" src="en.vtt"><track kind="subtitles" srclang="fr" src="fr.vtt"></video>';
const files = new Map([['en.vtt', en], ['fr.vtt', fr]]);
const has = (issues, code) => assert.ok(issues.some((item) => item.code === code),
  `Expected ${code}, got: ${JSON.stringify(issues)}`);

describe('caption time parser', () => {
  it('parses seconds and milliseconds', () => assert.equal(cueMillis('00:02.345'), 2345));
  it('parses hours', () => assert.equal(cueMillis('01:00:02.345'), 3602345));
  it('rejects impossible seconds', () => assert.equal(cueMillis('00:60.000'), null));
  it('rejects impossible minutes', () => assert.equal(cueMillis('60:00.000'), null));
  it('rejects non-timestamps', () => assert.equal(cueMillis('now'), null));
  it('parses two cues', () => assert.equal(parseCaptionCues(en).cues.length, 2));
  it('ignores translated content for timing', () => assert.deepEqual(parseCaptionCues(en), parseCaptionCues(fr)));
  it('rejects an invalid header', () => assert.deepEqual(parseCaptionCues('invalid').errors, ['header']));
  it('rejects empty cue text', () => assert.ok(parseCaptionCues('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n').errors.length));
  it('rejects reversed timestamps', () => assert.ok(parseCaptionCues('WEBVTT\n\n00:00:02.000 --> 00:00:01.000\nText').errors.length));
  it('rejects malformed timestamps', () => assert.ok(parseCaptionCues('WEBVTT\n\n00:99:01.000 --> 00:99:02.000\nText').errors.length));
  it('rejects reversed cue ordering', () => assert.ok(parseCaptionCues('WEBVTT\n\n00:00:05.000 --> 00:00:06.000\nLater\n\n00:00:01.000 --> 00:00:02.000\nEarlier').errors.length));
});

describe('bilingual caption parity', () => {
  it('accepts aligned translated cues', () => assert.deepEqual(compareCaptionCues(en, fr), []));
  it('rejects missing translated cues', () => has(compareCaptionCues(en, 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nBonjour'), 'CAPTION_CUE_COUNT'));
  it('rejects materially shifted cues', () => has(compareCaptionCues(en, fr.replace('00:00:03.000', '00:00:03.800')), 'CAPTION_CUE_ALIGNMENT'));
  it('accepts small timing drift', () => assert.deepEqual(compareCaptionCues(en, fr.replace('00:00:03.000', '00:00:03.200')), []));
  it('rejects malformed translated cues', () => has(compareCaptionCues(en, 'invalid'), 'CAPTION_CUE_PARSE'));
  it('returns the media file in diagnostics', () => assert.equal(compareCaptionCues(en, 'invalid', 'fr/watch.html')[0].file, 'fr/watch.html'));
  it('recognizes a paired local video', () => assert.deepEqual(inspectBilingualCaptions(video, 'index.html', files), []));
  it('ignores unrelated pages', () => assert.deepEqual(inspectBilingualCaptions('<main>No video</main>', 'index.html', files), []));
  it('ignores audio-only media', () => assert.deepEqual(inspectBilingualCaptions('<audio controls src="a.mp3"></audio>', 'index.html', files), []));
  it('flags mismatched paired video cues', () => has(inspectBilingualCaptions(video, 'index.html', new Map([['en.vtt', en], ['fr.vtt', 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nOui']])), 'CAPTION_CUE_COUNT'));
});
