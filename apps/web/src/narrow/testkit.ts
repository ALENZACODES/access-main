/** Tiny fake DOM for testing the in-page functions without a browser. Test support only. */

export interface Style {
  display: string;
  visibility: string;
  color: string;
  backgroundColor: string;
  backgroundImage: string;
  fontSize: string;
  fontWeight: string;
  position: string;
  overflowX: string;
  overflowY: string;
  outlineStyle: string;
  outlineWidth: string;
  outlineColor: string;
  outlineOffset: string;
  boxShadow: string;
  borderTopColor: string;
  borderTopWidth: string;
  borderRightColor: string;
  borderRightWidth: string;
  borderBottomColor: string;
  borderBottomWidth: string;
  borderLeftColor: string;
  borderLeftWidth: string;
  textDecorationLine: string;
  textOverflow: string;
  content: string;
  lineHeight: string;
  textAlign: string;
  fontStyle: string;
  flexDirection: string;
  order: string;
}

export interface Scroll {
  sw: number;
  cw: number;
  sh: number;
  ch: number;
}

export interface Spec {
  tag: string;
  id?: string;
  attrs?: Record<string, string>;
  /** Own text node. */
  text?: string;
  /** left, top, right, bottom. Default 0,0,100,20. */
  rect?: [number, number, number, number];
  style?: Partial<Style>;
  children?: Spec[];
  /** Matched by the interactive selector. */
  interactive?: boolean;
  labels?: string[];
  value?: string;
  scroll?: Scroll;
  /** Used instead of scroll while the text spacing style is attached. */
  scrollAfter?: Scroll;
  noFocus?: boolean;
  /** Style while this element has focus. */
  focusStyle?: Partial<Style>;
  /** Style of an ancestor while a descendant has focus. */
  focusWithinStyle?: Partial<Style>;
  /** Extra properties set on the element, such as paused or duration on media. */
  props?: Record<string, unknown>;
  /** Style of the ::after pseudo element while this element has focus. */
  afterFocusStyle?: Partial<Style>;
  /** Style of the ::before and ::after pseudo elements at all times. */
  before?: Partial<Style>;
  after?: Partial<Style>;
}

const DEFAULT_STYLE: Style = {
  display: 'block',
  visibility: 'visible',
  color: 'rgb(0, 0, 0)',
  backgroundColor: 'rgba(0, 0, 0, 0)',
  backgroundImage: 'none',
  fontSize: '16px',
  fontWeight: '400',
  position: 'static',
  overflowX: 'visible',
  overflowY: 'visible',
  outlineStyle: 'none',
  outlineWidth: '0px',
  outlineColor: 'rgb(0, 0, 0)',
  outlineOffset: '0px',
  boxShadow: 'none',
  borderTopColor: 'rgb(0, 0, 0)',
  borderTopWidth: '0px',
  borderRightColor: 'rgb(0, 0, 0)',
  borderRightWidth: '0px',
  borderBottomColor: 'rgb(0, 0, 0)',
  borderBottomWidth: '0px',
  borderLeftColor: 'rgb(0, 0, 0)',
  borderLeftWidth: '0px',
  textDecorationLine: 'none',
  textOverflow: 'clip',
  content: 'normal',
  lineHeight: 'normal',
  textAlign: 'start',
  fontStyle: 'normal',
  flexDirection: 'row',
  order: '0',
};

export interface World {
  spacingOn: boolean;
  active: FakeEl | null;
  scrollTo: Array<[number, number]>;
  styleElements: number;
}

export class FakeEl {
  readonly tagName: string;
  readonly id: string;
  parentElement: FakeEl | null = null;
  readonly kids: FakeEl[] = [];
  constructor(
    readonly spec: Spec,
    private readonly world: World,
  ) {
    this.tagName = spec.tag.toUpperCase();
    this.id = spec.id ?? '';
    if (spec.props) Object.assign(this, spec.props);
  }
  get children(): Array<FakeEl> {
    return this.kids;
  }
  get childNodes(): Array<{ nodeType: number; textContent: string | null; tagName?: string }> {
    const text = this.spec.text ? [{ nodeType: 3, textContent: this.spec.text }] : [];
    return [...text, ...this.kids.map((k) => ({ nodeType: 1, textContent: k.textContent, tagName: k.tagName }))];
  }
  get textContent(): string {
    return [this.spec.text ?? '', ...this.kids.map((k) => k.textContent)].join(' ').trim();
  }
  get value(): string | undefined {
    return this.spec.value;
  }
  get labels(): Array<{ textContent: string }> | null {
    return this.spec.labels ? this.spec.labels.map((textContent) => ({ textContent })) : null;
  }
  getAttribute(n: string): string | null {
    return this.spec.attrs?.[n] ?? null;
  }
  getBoundingClientRect(): { left: number; top: number; right: number; bottom: number; width: number; height: number } {
    const [left, top, right, bottom] = this.spec.rect ?? [0, 0, 100, 20];
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }
  /** Descendants in document order. */
  private below(): FakeEl[] {
    return this.kids.flatMap((k) => [k, ...k.below()]);
  }
  /** True for a list of simple selectors: a tag, `[attr]`, `[attr="value"]`, and one `:not([attr="value"])`. Enough for the probes that look inside an element. */
  matches(selector: string): boolean {
    return selector.split(',').some((one) => {
      const m = /^([a-z0-9*]*)((?:\[[^\]]+\])*)(?::not\((\[[^\]]+\])\))?$/i.exec(one.trim());
      if (!m) return false;
      const attr = (cond: string): boolean => {
        const a = /^\[([a-z-]+)(?:="([^"]*)")?\]$/i.exec(cond);
        if (!a) return false;
        const value = this.getAttribute(a[1] ?? '');
        return a[2] === undefined ? value !== null : value === a[2];
      };
      if (m[1] && m[1] !== '*' && this.tagName.toLowerCase() !== m[1].toLowerCase()) return false;
      for (const cond of (m[2] ?? '').match(/\[[^\]]+\]/g) ?? []) if (!attr(cond)) return false;
      return m[3] ? !attr(m[3]) : true;
    });
  }
  querySelectorAll(selector: string): FakeEl[] {
    return this.below().filter((e) => e.matches(selector));
  }
  querySelector(selector: string): FakeEl | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  closest(selector: string): FakeEl | null {
    if (this.matches(selector)) return this;
    return this.parentElement ? this.parentElement.closest(selector) : null;
  }
  contains(o: FakeEl): boolean {
    for (let p: FakeEl | null = o; p; p = p.parentElement) if (p === this) return true;
    return false;
  }
  focus(): void {
    if (!this.spec.noFocus) this.world.active = this;
  }
  blur(): void {
    if (this.world.active === this) this.world.active = null;
  }
  private scroll(): Scroll {
    const s = this.world.spacingOn ? (this.spec.scrollAfter ?? this.spec.scroll) : this.spec.scroll;
    return s ?? { sw: 100, cw: 100, sh: 20, ch: 20 };
  }
  get scrollWidth(): number {
    return this.scroll().sw;
  }
  get clientWidth(): number {
    return this.scroll().cw;
  }
  get scrollHeight(): number {
    return this.scroll().sh;
  }
  get clientHeight(): number {
    return this.scroll().ch;
  }
  get tabIndex(): number {
    const t = this.spec.attrs?.['tabindex'];
    if (t !== undefined) return Number(t);
    return this.spec.interactive ? 0 : -1;
  }
  style(pseudo?: string): Style {
    const active = this.world.active;
    if (pseudo) {
      const own = pseudo === '::before' ? this.spec.before : this.spec.after;
      return { ...DEFAULT_STYLE, ...own, ...(active === this ? this.spec.afterFocusStyle : undefined) };
    }
    const within = active && active !== this && this.contains(active) ? this.spec.focusWithinStyle : undefined;
    return { ...DEFAULT_STYLE, ...this.spec.style, ...(active === this ? this.spec.focusStyle : undefined), ...within };
  }
}

export interface DomOptions {
  lang?: string;
  manifest?: boolean;
  scrollWidth?: number;
  clientWidth?: number;
  innerWidth?: number;
  innerHeight?: number;
  html?: string;
  doctype?: boolean;
  title?: string;
  animations?: Array<{ iterations: number; target?: string }>;
}

export interface Installed {
  all: FakeEl[];
  world: World;
  uninstall(): void;
}

export function installDom(roots: Spec[], opts: DomOptions = {}): Installed {
  const world: World = { spacingOn: false, active: null, scrollTo: [], styleElements: 0 };
  const all: FakeEl[] = [];
  const byId = new Map<string, FakeEl>();
  const build = (spec: Spec, parent: FakeEl | null): FakeEl => {
    const el = new FakeEl(spec, world);
    el.parentElement = parent;
    if (parent) parent.kids.push(el);
    all.push(el);
    if (spec.id) byId.set(spec.id, el);
    for (const c of spec.children ?? []) build(c, el);
    return el;
  };
  for (const r of roots) build(r, null);
  const g = globalThis as unknown as Record<string, unknown>;
  const saved = {
    document: g['document'],
    getComputedStyle: g['getComputedStyle'],
    innerWidth: g['innerWidth'],
    innerHeight: g['innerHeight'],
    scrollX: g['scrollX'],
    scrollY: g['scrollY'],
    scrollTo: g['scrollTo'],
  };
  g['document'] = {
    querySelectorAll: () => all.filter((e) => e.spec.interactive),
    querySelector: (sel: string) => (sel.includes('manifest') && opts.manifest ? {} : null),
    getElementById: (id: string) => byId.get(id) ?? null,
    // The body has a box as wide as the page and the style every element starts from. Root elements keep no parent, as before.
    body: Object.assign(new FakeEl({ tag: 'body', rect: [0, 0, opts.clientWidth ?? 320, opts.innerHeight ?? 640] }, world), { querySelectorAll: () => all }),
    get activeElement() {
      return world.active;
    },
    documentElement: {
      tagName: 'HTML',
      style: () => ({ ...DEFAULT_STYLE }),
      scrollWidth: opts.scrollWidth ?? 320,
      clientWidth: opts.clientWidth ?? 320,
      getAttribute: (n: string) => (n === 'lang' ? (opts.lang ?? 'en') : null),
      outerHTML:
        opts.html ?? '<html lang="en"><head><title>t</title></head><body><main><h1>x</h1></main></body></html>',
    },
    doctype: opts.doctype === false ? null : {},
    title: opts.title ?? '',
    getAnimations: () =>
      (opts.animations ?? []).map((a) => ({
        playState: 'running',
        effect: { target: a.target ? { tagName: 'DIV', id: a.target } : null, getComputedTiming: () => ({ iterations: a.iterations }) },
      })),
    head: {
      appendChild: () => {
        world.spacingOn = true;
        world.styleElements++;
      },
    },
    createElement: () => ({
      textContent: '' as string | null,
      remove() {
        world.spacingOn = false;
        world.styleElements--;
      },
    }),
  };
  g['getComputedStyle'] = (e: FakeEl, pseudo?: string) => e.style(pseudo);
  g['innerWidth'] = opts.innerWidth ?? 320;
  g['innerHeight'] = opts.innerHeight ?? 640;
  g['scrollX'] = 0;
  g['scrollY'] = 40;
  g['scrollTo'] = (x: number, y: number) => {
    world.scrollTo.push([x, y]);
  };
  return {
    all,
    world,
    uninstall() {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete g[k];
        else g[k] = v;
      }
    },
  };
}

/**
 * Moves focus like the Tab key does: to the next tabbable control in document
 * order, or off the page after the last one. A control with trap set keeps focus.
 */
export function tabNext(dom: Installed): void {
  const order = dom.all.filter((e) => e.tabIndex >= 0 && e.spec.interactive && !e.spec.noFocus && e.spec.attrs?.['disabled'] === undefined);
  const cur = dom.world.active;
  if (cur && cur.spec.attrs?.['data-trap'] !== undefined) return;
  const at = cur ? order.indexOf(cur) : -1;
  const next = order[at + 1];
  dom.world.active = next ?? null;
}
