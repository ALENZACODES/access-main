/**
 * Static checks for explicit HTML and CSS interaction defects.
 * Computed CSS, shadow DOM and keyboard behaviour need browser coverage.
 * This gate catches detectable failures without treating silence as success.
 */
import { finding, tokenizeHtml } from './site-audit.mjs';

const CONTROL_TAGS = new Set(['button', 'input', 'select', 'textarea']);
const LABELABLE_TAGS = new Set(['input', 'select', 'textarea']);
const LANDMARKS = new Set(['main', 'nav', 'header', 'footer', 'aside']);
const NAMED_ROLES = new Set(['button', 'link', 'checkbox', 'radio', 'switch',
  'combobox', 'textbox', 'slider', 'spinbutton', 'tab', 'menuitem', 'option']);
const ARIA_STATES = new Map([
  ['aria-expanded', new Set(['true', 'false'])],
  ['aria-hidden', new Set(['true', 'false'])],
  ['aria-disabled', new Set(['true', 'false'])],
  ['aria-checked', new Set(['true', 'false', 'mixed'])],
  ['aria-selected', new Set(['true', 'false'])],
  ['aria-pressed', new Set(['true', 'false', 'mixed'])],
  ['aria-required', new Set(['true', 'false'])],
  ['aria-invalid', new Set(['true', 'false', 'grammar', 'spelling'])],
]);
const INPUT_TYPES_WITHOUT_LABELS = new Set(['hidden', 'submit', 'reset',
  'button', 'image']);
const BLOCKING_VIEWPORT = /(?:^|[,;\s])(?:user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:\.0*)?)(?=\s|,|;|$)/i;

export function extractIds(tags) {
  const ids = new Map();
  for (const tag of tags) {
    if (!tag.attrs.id) continue;
    if (!ids.has(tag.attrs.id)) ids.set(tag.attrs.id, []);
    ids.get(tag.attrs.id).push(tag);
  }
  return ids;
}

export function associatedLabels(tags) {
  const labels = new Set();
  for (const tag of tags) {
    if (tag.name === 'label' && tag.attrs.for) labels.add(tag.attrs.for);
  }
  return labels;
}

export function hasAccessibleName(tag, labels, ids) {
  const attrs = tag.attrs;
  if (typeof attrs['aria-label'] === 'string' && attrs['aria-label'].trim()) return true;
  if (typeof attrs['aria-labelledby'] === 'string') {
    const refs = attrs['aria-labelledby'].trim().split(/\s+/).filter(Boolean);
    if (refs.length && refs.every((ref) => ids.has(ref))) return true;
  }
  if (attrs.id && labels.has(attrs.id)) return true;
  if (tag.name === 'input') {
    const type = (attrs.type ?? 'text').toLowerCase();
    if (INPUT_TYPES_WITHOUT_LABELS.has(type)) return true;
  }
  if (tag.name === 'button' || tag.name === 'a') {
    // Outer text cannot be inferred from a tokenizer-only start tag.
    return null;
  }
  return false;
}

export function inspectHtmlInteractions(html, file) {
  const issues = [];
  const tags = tokenizeHtml(html);
  const ids = extractIds(tags);
  const labels = associatedLabels(tags);
  for (const [id, matches] of ids) {
    if (matches.length > 1) issues.push(finding('DUPLICATE_ID', file,
      `Duplicate id: ${id}`));
  }
  const root = tags.find((tag) => tag.name === 'html');
  if (root?.attrs.dir && !['ltr', 'rtl', 'auto'].includes(root.attrs.dir)) {
    issues.push(finding('INVALID_DIRECTION', file, 'Invalid document direction'));
  }
  const mains = tags.filter((tag) => tag.name === 'main' || tag.attrs.role === 'main');
  if (mains.length > 1) issues.push(finding('MULTIPLE_MAIN', file,
    'Multiple main landmarks'));
  for (const tag of tags) {
    const attrs = tag.attrs;
    const kind = (attrs.type ?? 'text').toLowerCase();
    if (tag.name === 'meta' && attrs.name?.toLowerCase() === 'viewport' &&
      BLOCKING_VIEWPORT.test(attrs.content ?? '')) {
      issues.push(finding('ZOOM_BLOCKED', file,
        'Viewport explicitly limits user zoom'));
    }
    if (attrs.tabindex !== undefined) {
      const n = Number(attrs.tabindex);
      if (!/^-?\d+$/.test(attrs.tabindex) || !Number.isSafeInteger(n)) {
        issues.push(finding('TABINDEX_INVALID', file, 'Invalid tabindex'));
      } else if (n > 0) {
        issues.push(finding('TABINDEX_POSITIVE', file,
          'Positive tabindex overrides natural navigation order'));
      }
    }
    if (attrs.autofocus !== undefined && attrs['aria-hidden'] === 'true') {
      issues.push(finding('FOCUS_HIDDEN', file,
        'Autofocus target is hidden from assistive technology'));
    }
    if (attrs.inert !== undefined && attrs.autofocus !== undefined) {
      issues.push(finding('FOCUS_INERT', file, 'Autofocus target is inert'));
    }
    if (attrs.role === 'presentation' || attrs.role === 'none') {
      if (CONTROL_TAGS.has(tag.name) || tag.name === 'a' && attrs.href) {
        issues.push(finding('PRESENTATIONAL_CONTROL', file,
          'Interactive element has a presentational role'));
      }
    }
    if (tag.name === 'a' && attrs.href !== undefined &&
      attrs.href.trim().toLowerCase().startsWith('javascript:')) {
      issues.push(finding('JAVASCRIPT_LINK', file, 'Script URL is not a safe link'));
    }
    if (tag.name === 'a' && attrs.target === '_blank' &&
      !/\bnoopener\b/i.test(attrs.rel ?? '')) {
      issues.push(finding('OPENER_LINK', file,
        'New browsing context needs rel=noopener'));
    }
    if (tag.name === 'input') {
      if (kind !== 'hidden' && kind !== 'image' && kind !== 'submit' &&
          kind !== 'reset' && kind !== 'button' &&
          !hasAccessibleName(tag, labels, ids)) {
        issues.push(finding('INPUT_LABEL', file,
          `Input ${attrs.id ?? attrs.name ?? '(unnamed)'} has no programmatic label`));
      }
      if (kind === 'image' && !(attrs.alt ?? '').trim()) {
        issues.push(finding('INPUT_IMAGE_NAME', file, 'Image input has no alternative text'));
      }
    }
    if ((tag.name === 'select' || tag.name === 'textarea') &&
      !hasAccessibleName(tag, labels, ids)) {
      issues.push(finding('CONTROL_LABEL', file,
        `${tag.name} lacks an explicit programmatic label`));
    }
    for (const [attribute, states] of ARIA_STATES) {
      if (Object.hasOwn(attrs, attribute) && !states.has(attrs[attribute])) {
        issues.push(finding('ARIA_VALUE', file,
          `${attribute} has an invalid value`));
      }
    }
    for (const attribute of ['aria-labelledby', 'aria-describedby',
      'aria-controls', 'aria-errormessage', 'aria-details']) {
      if (!Object.hasOwn(attrs, attribute)) continue;
      const refs = attrs[attribute].trim().split(/\s+/).filter(Boolean);
      if (!refs.length || refs.some((ref) => !ids.has(ref))) {
        issues.push(finding('ARIA_REFERENCE', file,
          `${attribute} references a missing element`));
      }
    }
    if (attrs.role && NAMED_ROLES.has(attrs.role) &&
        attrs['aria-label'] !== undefined && !attrs['aria-label'].trim()) {
      issues.push(finding('EMPTY_ARIA_NAME', file,
        `Named role ${attrs.role} has an empty aria-label`));
    }
    if (tag.name === 'label' && attrs.for && !ids.has(attrs.for)) {
      issues.push(finding('LABEL_TARGET', file,
        `Label references missing id: ${attrs.for}`));
    }
    if (tag.name === 'html' && attrs['aria-hidden'] === 'true') {
      issues.push(finding('ROOT_HIDDEN', file, 'Entire page is aria-hidden'));
    }
    if (LANDMARKS.has(tag.name) && attrs['aria-hidden'] === 'true' &&
      attrs.autofocus !== undefined) {
      issues.push(finding('HIDDEN_LANDMARK_FOCUS', file,
        'Hidden landmark cannot contain an autofocus target'));
    }
  }
  return issues;
}

export function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * This parser deliberately does not compute selectors or cascade. It
 * highlights explicit declarations capable of breaking user preferences.
 */
export function cssDeclarations(css) {
  const cleaned = stripCssComments(css);
  const declarations = [];
  const re = /([\w-]+)\s*:\s*([^;{}]+)(?:;|(?=\}))/g;
  let match;
  while ((match = re.exec(cleaned))) {
    declarations.push({ name: match[1].toLowerCase(),
      value: match[2].trim().toLowerCase(), offset: match.index });
  }
  return declarations;
}

export function cssPixelTargets(css) {
  const results = [];
  const cleaned = stripCssComments(css);
  // Look only at declarations in explicit interactive selectors; never
  // infer tap area from icon dimensions or a descendant's dimensions.
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let rule;
  while ((rule = re.exec(cleaned))) {
    const selector = rule[1].trim();
    if (!/(?:^|[\s,>+~])(?:button|a|input|select|textarea)(?=[\s.#:[,>+~]|$)|\[role\s*=\s*['"]?(?:button|link)['"]?\]/i.test(selector)) {
      continue;
    }
    const sizes = new Map();
    for (const decl of cssDeclarations(rule[2])) {
      if (['width', 'height', 'min-width', 'min-height'].includes(decl.name)) {
        const value = /^([\d.]+)px(?:\s*!important)?$/.exec(decl.value);
        if (value) sizes.set(decl.name, Number(value[1]));
      }
    }
    if (sizes.size) results.push({ selector, sizes });
  }
  return results;
}

export function inspectCssInteractions(css, file) {
  const issues = [];
  const clean = stripCssComments(css);
  for (const entry of cssPixelTargets(clean)) {
    const width = entry.sizes.get('min-width') ?? entry.sizes.get('width');
    const height = entry.sizes.get('min-height') ?? entry.sizes.get('height');
    // Only emit when the stylesheet explicitly constrains both axes.
    // Other layout mechanisms, including padding, need computed checks.
    if (width !== undefined && height !== undefined &&
        width < 44 && height < 44) {
      issues.push(finding('EXPLICIT_SMALL_TARGET', file,
        `Interactive selector ${entry.selector} declares ${width}x${height}px`));
    }
  }
  if (/(?:^|\})\s*\*\s*:\s*focus\s*\{[^{}]*outline\s*:\s*(?:0|none)(?:\s|;|!|\})/i.test(clean)) {
    issues.push(finding('GLOBAL_FOCUS_REMOVED', file,
      'Global focus outline removed'));
  }
  if (/(?:^|[\s,])(?:html|body)\s*\{[^{}]*user-select\s*:\s*none(?:\s|;|!|\})/i.test(clean)) {
    issues.push(finding('TEXT_SELECTION_BLOCKED', file,
      'Text selection disabled on the document'));
  }
  for (const decl of cssDeclarations(clean)) {
    if (decl.name === 'scroll-behavior' && decl.value === 'smooth' &&
      !clean.includes('prefers-reduced-motion')) {
      issues.push(finding('UNGUARDED_SMOOTH_SCROLL', file,
        'Smooth scrolling has no reduced-motion override'));
      break;
    }
  }
  return issues;
}

export function findInputNames(html) {
  const tags = tokenizeHtml(html);
  const ids = extractIds(tags);
  const labels = associatedLabels(tags);
  return tags.filter((tag) => LABELABLE_TAGS.has(tag.name))
    .map((tag) => ({ name: tag.attrs.name ?? '',
      id: tag.attrs.id ?? '', labelled: hasAccessibleName(tag, labels, ids) }));
}

export function documentInteractionSummary(html) {
  const tags = tokenizeHtml(html);
  return {
    controls: tags.filter((tag) => CONTROL_TAGS.has(tag.name)).length,
    links: tags.filter((tag) => tag.name === 'a' && tag.attrs.href !== undefined).length,
    landmarks: tags.filter((tag) => LANDMARKS.has(tag.name)).length,
    labelledInputs: findInputNames(html).filter((value) => value.labelled === true).length,
  };
}
