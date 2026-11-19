# Checks that compare pages

Most checks read one page. Three read several pages of one site and compare
them. They need at least two pages.

| Check | What it compares | Where it runs |
| --- | --- | --- |
| `consistency` | Order of the navigation, place of the help link, page titles, page language. | Browser run, from measured facts. From markup through `auditSitePages`. |
| `site-links` | Where links go, what they are called, which ids pages hold. | Browser run and `auditSitePages`. |
| `lang-pairs` | English and French versions named with `hreflang`. | Browser run and `auditSitePages`. |

`site-links` and `lang-pairs` are new. In a browser run (`--route` given two
or more times) they are added to the `site` part of the report next to
`consistency`. They read the markup the browser holds after the page has
loaded, so links a script has added by then are seen.

## What fails and what is UNKNOWN

Only what the markup settles fails:

- `site-links/anchor-missing`: a link to `#id` on another page read, and that
  page has no element with the id.
- `site-links/page-missing`: a link to a page that is not in the set, only
  when the caller says the set is the whole site (`complete: true`).
- `lang-pairs/alternate-one-way`: page A names B as its other-language
  version and B does not name A back.
- `lang-pairs/alternate-lang`: the page named is marked in another language
  than the one announced.

Everything else is UNKNOWN, for a person: one destination under two names, one
name for two destinations, the same main heading on two pages, a page nothing
links to, no search and no site map, a page with no other-language version, no
visible link to the other version, and versions with different numbers of
headings, links, fields, images, tables, list items or buttons.

## Limits to keep in mind

- **A sample is not the site.** When only some pages are read, links to other
  pages are counted in one UNKNOWN entry and pages nothing links to are not
  reported, because most links of a sampled page go to pages outside the
  sample.
- **Matching counts say nothing about the words.** `lang-pairs` compares how
  many headings, links and so on each version holds. Nobody has read the
  translation.
- **`lang-pairs` is a rule of the App, not a WCAG criterion.** The App is
  offered in English and French.
- **Names come from markup.** A link name is its `aria-label`, else its text,
  else the alt of an image inside. A name set through `aria-labelledby` or by
  a script is not resolved here.
- **`site-links` compares pages of one language with each other.** "Help" and
  "Aide" for the same page are not reported as two names.

## From files

```ts
import { auditSitePages, siteFromFiles } from './sitefiles.js';

const site = siteFromFiles(files, 'dist'); // files: { file, html }[]
const audit = auditSitePages(site.pages, { complete: true }); // a RouteAudit named "site", or null
```

`routeOfFile('dist/fr/index.html', 'dist')` gives `/fr`. Files outside the
root, and a second file for a route already given, are listed in `site.left`.

This is not yet an option of the command line for `--html` files. `cli.ts` is
changed by another chunk of this lane that has not merged, so adding an option
here would collide with it.
