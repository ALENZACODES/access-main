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
  }
  get childNodes(): Array<{ nodeType: number; textContent: string | null }> {
    return this.spec.text ? [{ nodeType: 3, textContent: this.spec.text }] : [];
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
  style(): Style {
    return { ...DEFAULT_STYLE, ...this.spec.style };
  }
}

export interface DomOptions {
  lang?: string;
  manifest?: boolean;
  scrollWidth?: number;
  clientWidth?: number;
  innerWidth?: number;
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
    scrollX: g['scrollX'],
    scrollY: g['scrollY'],
    scrollTo: g['scrollTo'],
  };
  g['document'] = {
    querySelectorAll: (_sel: string) => all.filter((e) => e.spec.interactive),
    querySelector: (sel: string) => (sel.includes('manifest') && opts.manifest ? {} : null),
    getElementById: (id: string) => byId.get(id) ?? null,
    body: { querySelectorAll: (_sel: string) => all },
    get activeElement() {
      return world.active;
    },
    documentElement: {
      scrollWidth: opts.scrollWidth ?? 320,
      clientWidth: opts.clientWidth ?? 320,
      getAttribute: (n: string) => (n === 'lang' ? (opts.lang ?? 'en') : null),
    },
    head: {
      appendChild: (_s: unknown) => {
        world.spacingOn = true;
        world.styleElements++;
      },
    },
    createElement: (_tag: string) => ({
      textContent: '' as string | null,
      remove() {
        world.spacingOn = false;
        world.styleElements--;
      },
    }),
  };
  g['getComputedStyle'] = (e: FakeEl) => e.style();
  g['innerWidth'] = opts.innerWidth ?? 320;
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
