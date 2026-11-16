/** HTML data-table semantics: no visual-only table metadata assumptions. */
import { finding, tokenizeHtml } from './site-audit.mjs';

const TABLE_PATTERN = /<table\b[^>]*>[\s\S]*?<\/table\s*>/gi;
const CONTROL_PATTERN = /<(?:input|button|select|textarea)\b/gi;
const SUMMARY_PATTERN = /\b(?:sum|average|total|count)\b/i;
const SCOPE = new Set(['row', 'col', 'rowgroup', 'colgroup']);
const INT = /^[1-9]\d*$/;
const FRAGMENT = /^[^\s]+$/;
const INTERACTIVE = new Set(['button', 'input', 'select', 'textarea']);

function textInside(source, element) {
  const escaped = element.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}\\s*>`, 'i').exec(source);
  return match?.[1]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() ?? '';
}

function tableName(html, tags) {
  const table = tags.find((tag) => tag.name === 'table');
  if (!table) return '';
  if (table.attrs['aria-label']?.trim()) return table.attrs['aria-label'].trim();
  if (table.attrs['aria-labelledby']?.trim()) return table.attrs['aria-labelledby'].trim();
  return textInside(html, 'caption');
}

function tableCells(tags) {
  return tags.filter((tag) => tag.name === 'th' || tag.name === 'td');
}

/** Parse a table into a compact structural summary for testability. */
export function tableStructure(html) {
  const tags = tokenizeHtml(html);
  const cells = tableCells(tags);
  return {
    name: tableName(html, tags),
    headerCells: cells.filter((tag) => tag.name === 'th').length,
    dataCells: cells.filter((tag) => tag.name === 'td').length,
    rows: tags.filter((tag) => tag.name === 'tr').length,
    nestedTables: tags.filter((tag) => tag.name === 'table').length,
    controls: (html.match(CONTROL_PATTERN) ?? []).length,
  };
}

export function inspectDataTable(html, file = 'index.html', number = 1) {
  const issues = [];
  const tags = tokenizeHtml(html);
  const table = tags.find((tag) => tag.name === 'table');
  if (!table) return issues;
  const prefix = `Table ${number}: `;
  const push = (code, message) => issues.push(finding(code, file, prefix + message));
  const structure = tableStructure(html);
  const layout = table.attrs.role === 'presentation' || table.attrs.role === 'none';
  if (structure.nestedTables > 1) push('TABLE_NESTED', 'Nested tables are not supported');
  if (layout) {
    if (structure.headerCells) push('TABLE_PRESENTATION_HEADER',
      'Presentation tables must not contain header cells');
    if (structure.controls || /\b(?:tabindex|aria-sort)\s*=/i.test(html)) {
      push('TABLE_PRESENTATION_INTERACTIVE',
        'Interactive content cannot be hidden inside a presentation table');
    }
    return issues;
  }
  if (!structure.name) push('TABLE_NAME', 'Data table must have a caption or accessible name');
  if (!structure.headerCells && structure.dataCells) {
    push('TABLE_HEADERS', 'Data table needs explicit column or row headers');
  }
  if (!structure.rows && structure.dataCells) {
    push('TABLE_ROWS', 'Data cells must be inside table rows');
  }
  const allIds = new Set(tags.filter((tag) => tag.attrs.id).map((tag) => tag.attrs.id));
  const headers = new Set(tags.filter((tag) => tag.name === 'th' && tag.attrs.id)
    .map((tag) => tag.attrs.id));
  for (const tag of tags) {
    if (tag.name === 'th') {
      if (tag.attrs.scope && !SCOPE.has(tag.attrs.scope.toLowerCase())) {
        push('TABLE_SCOPE', `Invalid header scope: ${tag.attrs.scope}`);
      }
      if (tag.attrs['aria-sort'] &&
        !['ascending', 'descending', 'none', 'other'].includes(tag.attrs['aria-sort'])) {
        push('TABLE_SORT', 'aria-sort must use a supported state');
      }
    }
    if (tag.name === 'td' || tag.name === 'th') {
      for (const attribute of ['colspan', 'rowspan']) {
        if (tag.attrs[attribute] && !INT.test(tag.attrs[attribute])) {
          push('TABLE_SPAN', `${attribute} must be a positive integer`);
        }
      }
      if (tag.attrs.headers !== undefined) {
        const references = tag.attrs.headers.split(/\s+/).filter(Boolean);
        if (!references.length) push('TABLE_EMPTY_HEADERS',
          'headers attribute cannot be empty');
        for (const id of references) {
          if (!FRAGMENT.test(id) || !headers.has(id)) {
            push('TABLE_HEADER_REFERENCE', `Missing header cell: ${id}`);
          }
        }
      }
    }
    if (INTERACTIVE.has(tag.name) && tag.attrs.tabindex &&
      Number(tag.attrs.tabindex) > 0) {
      push('TABLE_TAB_ORDER', 'Positive tabindex overrides natural keyboard order');
    }
  }
  if (table.attrs['aria-labelledby']) {
    for (const id of table.attrs['aria-labelledby'].split(/\s+/).filter(Boolean)) {
      if (!allIds.has(id)) push('TABLE_LABEL_REFERENCE',
        `Missing accessible-name target: ${id}`);
    }
  }
  if (table.attrs.summary && SUMMARY_PATTERN.test(table.attrs.summary)) {
    // Legacy table summary is never a substitute for an accessible caption.
    if (!textInside(html, 'caption') && !table.attrs['aria-label']) {
      push('TABLE_LEGACY_SUMMARY', 'Legacy summary cannot replace a caption');
    }
  }
  return issues;
}

export function inspectHtmlTables(html, file = 'index.html') {
  const issues = [];
  let number = 0;
  for (const match of html.matchAll(TABLE_PATTERN)) {
    number += 1;
    issues.push(...inspectDataTable(match[0], file, number));
  }
  const opens = (html.match(/<table(?:\s|>)/gi) ?? []).length;
  if (opens !== number) {
    issues.push(finding('TABLE_UNCLOSED', file, 'Incomplete or nested table markup'));
  }
  return issues;
}
