import { describe, expect, it } from 'vitest';
import { frTypographyIssues } from './i18n.js';
import { START_FIRST, START_INFO, START_PANELS, TOOLS, TOOL_NAMES, TOOL_TESTS, forText, isTool, startOrder, toolsNote, toolsText, type ToolId } from './start.js';
import { NBSP } from './types.js';

describe('the tools and the tests', () => {
  it('names every tool in both languages, tools only', () => {
    expect(TOOLS).toEqual(['finger', 'stylus', 'mouth-stick', 'head-pointer', 'eye-gaze', 'switch', 'voice', 'keyboard', 'mouse']);
    for (const t of TOOLS) {
      expect(TOOL_NAMES[t].en, t).not.toBe('');
      expect(frTypographyIssues(TOOL_NAMES[t].fr), t).toEqual([]);
    }
  });

  it('points every tool to tests that exist, each once', () => {
    for (const t of TOOLS) {
      const list = TOOL_TESTS[t];
      expect(list.length, t).toBeGreaterThanOrEqual(5);
      expect(new Set(list).size, t).toBe(list.length);
      for (const k of list) expect(START_PANELS, `${t} ${k}`).toContain(k);
    }
  });

  it('knows the heading, title and use of every test, in both languages', () => {
    for (const k of START_PANELS) {
      const info = START_INFO[k];
      expect(info.heading, k).toMatch(/^#[a-z]+-h$/);
      expect(info.go.en, k).toMatch(/^[a-z]/);
      for (const s of [info.title.fr, info.why.fr, info.go.fr]) {
        expect(frTypographyIssues(s), s).toEqual([]);
        expect(s).not.toMatch(/\p{L}'\p{L}/u);
      }
      expect(info.why.en.endsWith('.')).toBe(true);
    }
    expect(new Set(START_PANELS.map((k) => START_INFO[k].heading)).size).toBe(START_PANELS.length);
  });

  it('every test is first for some tool, so none is left out of every list', () => {
    const used = new Set(TOOLS.flatMap((t) => TOOL_TESTS[t]));
    expect(START_PANELS.filter((k) => !used.has(k))).toEqual(['hand']);
  });
});

describe('startOrder', () => {
  it('follows one tool’s list, then the other tests in page order', () => {
    const order = startOrder(['switch']);
    expect(order.slice(0, 7).map((t) => t.key)).toEqual(TOOL_TESTS.switch);
    expect(order[0]).toEqual({ key: 'scan', score: 7, forTools: ['switch'] });
    expect(order.slice(7).every((t) => t.score === 0 && t.forTools.length === 0)).toBe(true);
    expect(order.slice(7).map((t) => t.key)).toEqual(START_PANELS.filter((k) => !TOOL_TESTS.switch.includes(k)));
  });

  it('adds the weights over several tools, and says which tools each test is for', () => {
    const order = startOrder(['finger', 'head-pointer']);
    expect(order[0]).toEqual({ key: 'tap', score: 7 + 6, forTools: ['finger', 'head-pointer'] });
    const moving = order.find((t) => t.key === 'moving');
    expect(moving).toEqual({ key: 'moving', score: 7, forTools: ['head-pointer'] });
  });

  it('keeps the order of the page on a tie, and gives every test once', () => {
    const order = startOrder([]);
    expect(order.map((t) => t.key)).toEqual([...START_PANELS]);
    expect(startOrder([...TOOLS]).map((t) => t.key).sort()).toEqual([...START_PANELS].sort());
  });

  it('puts first the tests a switch user and a voice user share', () => {
    const top = startOrder(['switch', 'voice']).slice(0, START_FIRST).map((t) => t.key);
    // Typing pace: 5 for switches and 4 for voice, over scanning's 7 for switches alone.
    expect(top[0]).toBe('typing');
    expect(top).toContain('scan');
    expect(top).toContain('twice');
  });
});

describe('the words', () => {
  it('lists the tools in a sentence, in a set order', () => {
    expect(toolsText(['voice', 'finger'], 'en')).toBe('a finger on a touch screen and my voice');
    expect(toolsText(['switch', 'mouth-stick', 'keyboard'], 'fr')).toBe('une baguette buccale, un ou deux contacteurs et le clavier seulement');
    expect(toolsText([], 'en')).toBe('');
    expect(toolsText(['eye-gaze'], 'en')).toBe('eye gaze');
  });

  it('says what tools a test is useful with', () => {
    const [first] = startOrder(['finger', 'stylus']);
    expect(forText(first!, 'en')).toBe('Useful with a finger on a touch screen and a stylus.');
    expect(forText(first!, 'fr')).toBe('Utile avec un doigt sur un écran tactile et un stylet.');
  });

  it('gives one line for the summary, tools only, or nothing', () => {
    expect(toolsNote(['mouth-stick', 'voice'], 'en')).toBe('What I use: a mouth stick and my voice.');
    expect(toolsNote(['switch'], 'fr')).toBe(`Ce que j’utilise${NBSP}: un ou deux contacteurs.`);
    expect(toolsNote([], 'en')).toBe('');
  });

  it('knows its tools and nothing else', () => {
    for (const t of TOOLS) expect(isTool(t)).toBe(true);
    for (const x of ['hand', 'Finger', '', null]) expect(isTool(x)).toBe(false);
  });

  it('follows French typography, and says nothing about health', () => {
    const all: ToolId[] = [...TOOLS];
    const lines = [toolsText(all, 'fr'), toolsNote(all, 'fr'), ...startOrder(all).map((t) => forText(t, 'fr'))];
    for (const line of lines) {
      expect(frTypographyIssues(line), line).toEqual([]);
      expect(line.toLowerCase()).not.toMatch(/vérif|handicap|blessure|santé|lésion|diagnos|paralys|tétra|quadri/);
    }
    const en = [toolsText(all, 'en'), ...START_PANELS.map((k) => START_INFO[k].why.en)].join(' ').toLowerCase();
    expect(en).not.toMatch(/disab|injur|health|paraly|quadri|tetra|diagnos/);
  });
});
