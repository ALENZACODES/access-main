import { t, type CheckResult, type Entry } from './types.js';
import type { TableFact } from './structure.js';

/**
 * Data tables (WCAG 1.3.1). An empty header cell and a layout table that
 * holds header cells are measured failures. Merged cells without header links
 * and a table inside a table need a person to look, so they are UNKNOWN. A
 * table with no header cells or no name is already a rule of the static-html
 * check, so it is not repeated here.
 */

export type TableRule = 'empty-header' | 'layout-headers' | 'complex-headers' | 'nested';

export const TABLE_RULES: readonly TableRule[] = ['empty-header', 'layout-headers', 'complex-headers', 'nested'];

const isLayout = (t0: TableFact): boolean => t0.role === 'presentation' || t0.role === 'none';

/** A table the checks treat as data: it has at least two rows and two columns and is not marked as layout. */
export function isDataTable(t0: TableFact): boolean {
  return !isLayout(t0) && t0.rows >= 2 && t0.cols >= 2;
}

export function auditTables(tables: readonly TableFact[]): CheckResult {
  const entries: Entry[] = [];
  const add = (f: TableFact, status: 'fail' | 'unknown', rule: TableRule, en: string, fr: string): void => {
    entries.push({ check: 'tables', id: f.id, status, rule, message: t(en, fr) });
  };
  let checked = 0;
  for (const f of tables) {
    if (isLayout(f)) {
      checked++;
      if (f.headers + f.emptyHeaders > 0) {
        add(
          f,
          'fail',
          'layout-headers',
          'This table is marked as layout (role presentation) but holds header cells. A screen reader drops the headers, so the cells lose their meaning.',
          'Ce tableau est marqué comme mise en page (rôle presentation) mais contient des cellules d’en-tête. Un lecteur d’écran ignore les en-têtes, les cellules perdent donc leur sens.',
        );
      }
      continue;
    }
    if (!isDataTable(f)) continue;
    checked++;
    if (f.headers === 0 && f.emptyHeaders === 0) continue;
    if (f.emptyHeaders > 0) {
      add(
        f,
        'fail',
        'empty-header',
        `This table has ${f.emptyHeaders} header cell${f.emptyHeaders === 1 ? '' : 's'} with no text. A screen reader announces an empty header, or none.`,
        `Ce tableau a ${f.emptyHeaders} cellule${f.emptyHeaders === 1 ? '' : 's'} d’en-tête sans texte. Un lecteur d’écran annonce un en-tête vide, ou aucun.`,
      );
    }
    if (f.spans && f.scoped === 0) {
      add(
        f,
        'unknown',
        'complex-headers',
        'This table merges cells and its headers have no scope or id. Check that each cell is linked to the right headers.',
        'Ce tableau fusionne des cellules et ses en-têtes n’ont ni scope ni id. Contrôlez que chaque cellule est liée aux bons en-têtes.',
      );
    }
  }
  for (const f of tables) {
    if (f.nested) {
      add(
        f,
        'unknown',
        'nested',
        'This table sits inside another table. Check that the reading order and the headers still make sense.',
        'Ce tableau est placé dans un autre tableau. Contrôlez que l’ordre de lecture et les en-têtes ont toujours un sens.',
      );
    }
  }
  return { checked, entries };
}
