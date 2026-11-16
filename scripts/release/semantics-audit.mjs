/** Static form, disclosure, table and SVG accessibility checks. */
import { finding, tokenizeHtml } from './site-audit.mjs';

const INTERACTIVE_ROLES = new Set([
  'button', 'checkbox', 'radio', 'switch', 'link', 'tab',
  'menuitem', 'menuitemcheckbox', 'menuitemradio', 'slider',
  'spinbutton', 'textbox', 'combobox', 'option', 'treeitem',
]);
const INLINE_CONTROLS = new Set(['button', 'input', 'select', 'textarea']);
const DISABLED_KINDS = new Set(['hidden', 'submit', 'reset', 'button', 'image']);
const LANGUAGE = /^(?:en|fr)(?:-[a-z]{2,8})?$/i;
const DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const SPACING = /\s+/;

function isSet(attrs, key) {
  return Object.hasOwn(attrs, key);
}

export function attributeTokens(attrs, name) {
  return (attrs[name] ?? '').trim().split(SPACING).filter(Boolean);
}

export function hasReferenceNames(attrs, ids) {
  const names = attributeTokens(attrs, 'aria-labelledby');
  return names.length > 0 && names.every((name) => ids.has(name));
}

export function hasAttributeName(attrs, ids) {
  if ((attrs['aria-label'] ?? '').trim()) return true;
  if (hasReferenceNames(attrs, ids)) return true;
  if ((attrs.title ?? '').trim()) return true;
  return false;
}

export function fieldNameCandidates(tags) {
  const labels = new Set();
  const ids = new Set();
  const described = new Set();
  for (const tag of tags) {
    if (tag.attrs.id) ids.add(tag.attrs.id);
    if (tag.name === 'label' && tag.attrs.for) labels.add(tag.attrs.for);
    if (tag.attrs['aria-describedby']) {
      for (const name of attributeTokens(tag.attrs, 'aria-describedby')) {
        described.add(name);
      }
    }
  }
  return { labels, ids, described };
}

export function inspectFieldSemantics(tags, file) {
  const issues = [];
  const { labels, ids } = fieldNameCandidates(tags);
  for (const tag of tags) {
    const attrs = tag.attrs;
    if (!INLINE_CONTROLS.has(tag.name)) continue;
    const kind = (attrs.type ?? 'text').toLowerCase();
    if (tag.name === 'input' && kind === 'image' && !attrs.alt?.trim()) {
      issues.push(finding('SEM_IMAGE_SUBMIT_NAME', file,
        'Image submit control needs alternative text'));
    }
    if (tag.name === 'input' && DISABLED_KINDS.has(kind)) continue;
    if (isSet(attrs, 'required') && attrs['aria-required'] === 'false') {
      issues.push(finding('SEM_REQUIRED_CONFLICT', file,
        'Native required control conflicts with ARIA state'));
    }
    if (isSet(attrs, 'disabled') && attrs['aria-disabled'] === 'false') {
      issues.push(finding('SEM_DISABLED_CONFLICT', file,
        'Native disabled control conflicts with ARIA state'));
    }
    if (attrs['aria-describedby']) {
      for (const name of attributeTokens(attrs, 'aria-describedby')) {
        if (!ids.has(name)) issues.push(finding('SEM_DESCRIPTION_REFERENCE', file,
          `Description target is missing: ${name}`));
      }
    }
    if (tag.name === 'input' && kind === 'number') {
      const min = attrs.min === undefined ? null : Number(attrs.min);
      const max = attrs.max === undefined ? null : Number(attrs.max);
      if (min !== null && max !== null && Number.isFinite(min) &&
          Number.isFinite(max) && min > max) {
        issues.push(finding('SEM_NUMBER_RANGE', file,
          'Numeric input minimum exceeds maximum'));
      }
    }
    if (tag.name === 'input' && ['checkbox', 'radio'].includes(kind) &&
        attrs['aria-checked'] === 'mixed' && kind === 'radio') {
      issues.push(finding('SEM_RADIO_MIXED', file,
        'Radio controls cannot expose a mixed state'));
    }
    if (tag.name === 'button' && attrs.type &&
        !['button', 'submit', 'reset'].includes(attrs.type.toLowerCase())) {
      issues.push(finding('SEM_BUTTON_TYPE', file,
        'Invalid button type declaration'));
    }
    if (tag.name === 'input' && attrs.id && labels.has(attrs.id)) continue;
    if (hasAttributeName(attrs, ids)) continue;
    // Existing controls audit handles unnamed inputs; avoid false positives
    // for buttons whose text belongs to their closing tag.
  }
  return issues;
}

export function inspectLandmarkSemantics(tags, file) {
  const issues = [];
  const { ids } = fieldNameCandidates(tags);
  for (const tag of tags) {
    const attrs = tag.attrs;
    const role = attrs.role?.toLowerCase();
    if (role === 'dialog' || role === 'alertdialog') {
      if (!hasAttributeName(attrs, ids)) {
        issues.push(finding('SEM_DIALOG_NAME', file,
          'Dialog needs a programmatic name'));
      }
      if (attrs['aria-modal'] !== undefined &&
          !['true', 'false'].includes(attrs['aria-modal'])) {
        issues.push(finding('SEM_DIALOG_MODAL', file,
          'Dialog has an invalid modal state'));
      }
    }
    if (role === 'progressbar' || tag.name === 'progress') {
      const min = Number(attrs['aria-valuemin'] ?? '0');
      const max = Number(attrs['aria-valuemax'] ?? '100');
      const now = attrs['aria-valuenow'] === undefined ? null :
        Number(attrs['aria-valuenow']);
      if (!Number.isFinite(min) || !Number.isFinite(max) || min > max ||
          now !== null && (!Number.isFinite(now) || now < min || now > max)) {
        issues.push(finding('SEM_PROGRESS_RANGE', file,
          'Progress range has inconsistent bounds'));
      }
    }
    if (role === 'status' && attrs['aria-live'] === 'off') {
      issues.push(finding('SEM_STATUS_SILENCED', file,
        'Status message is disabled for live announcements'));
    }
    if (role === 'alert' && attrs['aria-live'] === 'off') {
      issues.push(finding('SEM_ALERT_SILENCED', file,
        'Alert message is disabled for live announcements'));
    }
    if (attrs['aria-current'] !== undefined &&
      !['page', 'step', 'location', 'date', 'time', 'true', 'false'].includes(
        attrs['aria-current'])) {
      issues.push(finding('SEM_CURRENT_VALUE', file,
        'Current item declares an invalid value'));
    }
    if (attrs['aria-live'] !== undefined &&
      !['off', 'polite', 'assertive'].includes(attrs['aria-live'])) {
      issues.push(finding('SEM_LIVE_VALUE', file,
        'Invalid live announcement priority'));
    }
    if (tag.name === 'details' && attrs.open === 'false') {
      issues.push(finding('SEM_DETAILS_BOOLEAN', file,
        'Boolean open attribute is present even when set to false'));
    }
    if (tag.name === 'dialog' && attrs.open === 'false') {
      issues.push(finding('SEM_DIALOG_BOOLEAN', file,
        'Boolean open attribute is present even when set to false'));
    }
    if (role && INTERACTIVE_ROLES.has(role) && attrs['aria-hidden'] === 'true') {
      issues.push(finding('SEM_HIDDEN_CONTROL', file,
        'Interactive role is hidden from assistive technology'));
    }
    if (tag.name === 'html' && attrs.lang && !LANGUAGE.test(attrs.lang)) {
      issues.push(finding('SEM_HTML_LANGUAGE', file,
        'Document language must be English or French'));
    }
  }
  return issues;
}

export function inspectTableSemantics(tags, file) {
  const issues = [];
  const tables = tags.filter((tag) => tag.name === 'table');
  if (!tables.length) return issues;
  const ths = tags.filter((tag) => tag.name === 'th');
  const cells = tags.filter((tag) => tag.name === 'td');
  if (cells.length && !ths.length) {
    issues.push(finding('SEM_TABLE_HEADERS', file,
      'Data table contains cells but no column or row headers'));
  }
  for (const tag of ths) {
    if (tag.attrs.scope !== undefined &&
      !['row', 'col', 'rowgroup', 'colgroup'].includes(tag.attrs.scope)) {
      issues.push(finding('SEM_TABLE_SCOPE', file,
        'Table header has an invalid scope'));
    }
  }
  for (const tag of [...ths, ...cells]) {
    const span = ['rowspan', 'colspan'];
    for (const attr of span) {
      if (tag.attrs[attr] !== undefined &&
          (!DECIMAL.test(tag.attrs[attr]) || Number(tag.attrs[attr]) < 1)) {
        issues.push(finding('SEM_TABLE_SPAN', file,
          `Table cell has invalid ${attr}`));
      }
    }
  }
  return issues;
}

export function inspectSvgSemantics(tags, file) {
  const issues = [];
  for (const tag of tags) {
    if (tag.name !== 'svg') continue;
    if (tag.attrs['aria-hidden'] === 'true') {
      if (tag.attrs.tabindex === '0' || tag.attrs.focusable === 'true') {
        issues.push(finding('SEM_HIDDEN_SVG_FOCUS', file,
          'Hidden graphic is keyboard focusable'));
      }
      continue;
    }
    if (tag.attrs.role === 'img' &&
        !tag.attrs['aria-label']?.trim() &&
        !tag.attrs['aria-labelledby']?.trim()) {
      issues.push(finding('SEM_SVG_NAME', file,
        'Graphic with image role needs a programmatic name'));
    }
  }
  return issues;
}

export function inspectSemanticHtml(html, file) {
  const tags = tokenizeHtml(html);
  return [
    ...inspectFieldSemantics(tags, file),
    ...inspectLandmarkSemantics(tags, file),
    ...inspectTableSemantics(tags, file),
    ...inspectSvgSemantics(tags, file),
  ];
}
