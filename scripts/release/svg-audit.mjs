/** Static safety and accessibility checks for shipped SVG documents. */
import { finding, tokenizeHtml } from './site-audit.mjs';

const EVENTS = /^on[a-z]+$/i;
const DANGEROUS_ELEMENTS = new Set([
  'script', 'foreignobject', 'iframe', 'object', 'embed', 'audio', 'video',
  'animate', 'animatemotion', 'animatetransform', 'set',
]);
const URL_ATTRIBUTES = new Set(['href', 'xlink:href', 'src']);
const ID_PATTERN = /^[A-Za-z_][A-Za-z\d_.:-]*$/;
const COLOR_PATTERN = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;
const REMOTE = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i;
const INTERNAL_FRAGMENT = /^#[A-Za-z_][A-Za-z\d_.:-]*$/;
const UNSAFE_STYLE = /(?:@import|expression\s*\(|-moz-binding\s*:|behavior\s*:)/i;
const ALLOWED_ARIA_HIDDEN = new Set(['true', 'false']);

export function extractSvgReferences(value) {
  if (typeof value !== 'string') return [];
  return [...value.matchAll(COLOR_PATTERN)].map((match) => match[2].trim());
}

export function svgTitleDescription(svg) {
  const title = /<title(?:\s[^>]*)?>([\s\S]*?)<\/title\s*>/i.exec(svg);
  const description = /<desc(?:\s[^>]*)?>([\s\S]*?)<\/desc\s*>/i.exec(svg);
  return {
    title: title?.[1]?.replace(/<[^>]*>/g, '').trim() ?? '',
    description: description?.[1]?.replace(/<[^>]*>/g, '').trim() ?? '',
  };
}

function localReference(value) {
  const text = String(value ?? '').trim();
  if (!text) return { kind: 'empty' };
  if (INTERNAL_FRAGMENT.test(text)) return { kind: 'fragment', id: text.slice(1) };
  if (text.startsWith('#')) return { kind: 'invalid' };
  if (REMOTE.test(text) || text.startsWith('/')) return { kind: 'external' };
  return { kind: 'external' };
}

function svgRoot(tags) {
  return tags.find((tag) => tag.name === 'svg');
}

function isDecorative(root) {
  return root?.attrs['aria-hidden'] === 'true' || root?.attrs.role === 'presentation' ||
    root?.attrs.role === 'none';
}

/**
 * Self-contained SVG files must not load content outside the shipped file.
 * Their accessible name must be explicit unless the SVG is decorative.
 * This does not inspect bitmap content or infer the meaning of an icon.
 */
export function inspectSvgDocument(svg, file = 'image.svg') {
  const issues = [];
  const tags = tokenizeHtml(svg);
  const root = svgRoot(tags);
  if (!root) return [finding('SVG_ROOT', file, 'SVG document has no svg element')];
  const ids = new Set();
  const used = new Set();
  for (const tag of tags) {
    const attrs = tag.attrs;
    if (DANGEROUS_ELEMENTS.has(tag.name)) {
      issues.push(finding('SVG_ACTIVE_ELEMENT', file, `Unsupported active element: ${tag.name}`));
    }
    if (attrs.id !== undefined) {
      if (!ID_PATTERN.test(attrs.id)) {
        issues.push(finding('SVG_INVALID_ID', file, 'SVG contains an invalid id'));
      } else if (ids.has(attrs.id)) {
        issues.push(finding('SVG_DUPLICATE_ID', file, `Duplicate id: ${attrs.id}`));
      }
      ids.add(attrs.id);
    }
    for (const [key, value] of Object.entries(attrs)) {
      if (EVENTS.test(key)) {
        issues.push(finding('SVG_EVENT_HANDLER', file, `Inline event handler: ${key}`));
      }
      if (URL_ATTRIBUTES.has(key)) {
        const ref = localReference(value);
        if (ref.kind === 'external') issues.push(finding('SVG_EXTERNAL_REFERENCE', file,
          `${tag.name} has an external ${key} dependency`));
        if (ref.kind === 'invalid') issues.push(finding('SVG_FRAGMENT_FORMAT', file,
          `${tag.name} has a malformed fragment reference`));
        if (ref.kind === 'fragment') used.add(ref.id);
      }
      if (key === 'style' && UNSAFE_STYLE.test(value)) {
        issues.push(finding('SVG_UNSAFE_STYLE', file, 'SVG has an unsafe inline style'));
      }
      if (['fill', 'stroke', 'filter', 'mask', 'clip-path', 'style'].includes(key)) {
        for (const url of extractSvgReferences(value)) {
          const ref = localReference(url);
          if (ref.kind === 'fragment') used.add(ref.id);
          else issues.push(finding('SVG_EXTERNAL_PAINT', file,
            `${tag.name} has a non-local paint or filter URL`));
        }
      }
    }
  }
  for (const id of used) {
    if (!ids.has(id)) issues.push(finding('SVG_MISSING_FRAGMENT', file,
      `Missing SVG fragment target: ${id}`));
  }
  const names = svgTitleDescription(svg);
  const attrs = root.attrs;
  if (attrs['aria-hidden'] !== undefined &&
    !ALLOWED_ARIA_HIDDEN.has(attrs['aria-hidden'])) {
    issues.push(finding('SVG_ARIA_HIDDEN', file, 'aria-hidden must be true or false'));
  }
  if (attrs.focusable === 'true' && isDecorative(root)) {
    issues.push(finding('SVG_DECORATIVE_FOCUS', file,
      'Decorative SVG must not be focusable'));
  }
  if (!isDecorative(root)) {
    const label = attrs['aria-label']?.trim() ?? '';
    const labelledby = (attrs['aria-labelledby'] ?? '').trim().split(/\s+/).filter(Boolean);
    if (!label && !names.title && labelledby.length === 0) {
      issues.push(finding('SVG_ACCESSIBLE_NAME', file,
        'Informative SVG needs a title or an accessible label'));
    }
    for (const id of labelledby) {
      if (!ids.has(id)) issues.push(finding('SVG_LABEL_TARGET', file,
        `Missing accessible-name target: ${id}`));
    }
    if (attrs.role === 'img' && !label && !names.title && !labelledby.length) {
      issues.push(finding('SVG_IMAGE_NAME', file, 'Image role is missing a name'));
    }
  }
  if (/<!doctype\s+[^>]*\b(?:system|public)\b/i.test(svg) ||
    /<!entity\s/i.test(svg)) {
    issues.push(finding('SVG_EXTERNAL_ENTITY', file, 'SVG must not declare entities'));
  }
  if (/<\?xml-stylesheet\b/i.test(svg)) {
    issues.push(finding('SVG_STYLESHEET', file, 'SVG must not load an XML stylesheet'));
  }
  return issues;
}

/** SVG embedded directly in HTML is inspected without imposing a file title. */
export function inspectInlineSvg(html, file = 'index.html') {
  const issues = [];
  const blocks = [...html.matchAll(/<svg\b[^>]*>[\s\S]*?<\/svg\s*>/gi)];
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index][0];
    for (const issue of inspectSvgDocument(block, file)) {
      issues.push({ ...issue, detail: `Inline SVG ${index + 1}: ${issue.detail}` });
    }
  }
  const opened = (html.match(/<svg(?:\s|>)/gi) ?? []).length;
  if (opened !== blocks.length) {
    issues.push(finding('SVG_UNCLOSED_INLINE', file, 'Unclosed or nested SVG markup'));
  }
  return issues;
}
