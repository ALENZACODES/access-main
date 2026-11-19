# Planning which routes to audit

A site with hundreds of thousands of place pages cannot be audited page by
page. These modules help decide which pages to audit, from text that is
already in hand. They fetch nothing and run offline.

| Module | What it does |
| --- | --- |
| `routes.ts` | Turns addresses into routes of the site and groups routes that share a template. |
| `sitemap.ts` | Reads a sitemap (XML or one address per line) into routes. |
| `discover.ts` | Lists the links of pages of markup: routes, other hosts and files. |
| `robots.ts` | Reads a robots.txt: sitemaps, and paths the site asks automated visitors to leave alone. |
| `sampling.ts` | Chooses a few routes per template and states how many are left out. |

## Example

```ts
import { parseRobots, splitByRobots } from './robots.js';
import { parseSitemap, routesFromSitemap } from './sitemap.js';
import { describePlan, planAudit } from './sampling.js';

const robots = parseRobots(robotsText);
const sitemap = parseSitemap(sitemapText);
if (sitemap.ok) {
  const { routes } = routesFromSitemap(sitemap.value, 'https://app.example/');
  const { allowed } = splitByRobots(robots, 'audit', routes);
  const plan = planAudit(allowed, { perTemplate: 3, always: ['/'] });
  console.log(describePlan(plan, 'en'));
}
```

## Limits to keep in mind

- **A sample is not the site.** The audit says something about the routes in
  the plan and nothing about the others. Two pages of one template can differ
  through their data: a long name, a missing photo, a wider table. Every plan
  states how many routes it leaves out.
- **Templates are a guess.** A segment is read as data when it is a number, a
  UUID, a long hexadecimal hash or a date, or when at least ten different
  values stand in the same place. A section with many hand-written pages looks
  the same as a section with many data pages; name it in `literals` to keep
  its pages apart. The first segment of a path is never replaced.
- **Only markup is read.** `discover.ts` does not run scripts, so links that a
  script adds are not found. `sitemap.ts` does not follow a sitemap index.
- **A robots file is a request.** `robots.ts` reports what the file asks. It
  does not stop any tool from visiting a page.
- **One site at a time.** Addresses on another host, or on another port, are
  counted and left out.

## Sources

| Source | Version or date | Licence | Used for |
| --- | --- | --- | --- |
| RFC 9309, Robots Exclusion Protocol (https://www.rfc-editor.org/rfc/rfc9309) | September 2022 | IETF Trust Legal Provisions | Groups, longest match, allow wins a tie |
| Sitemaps XML format (https://www.sitemaps.org/protocol.html) | Protocol 0.9 | Creative Commons Attribution-ShareAlike 2.5 | Element names, 50,000 addresses per file |
| WHATWG URL Standard (https://url.spec.whatwg.org/) | Living standard | Creative Commons Attribution 4.0 | Resolving addresses, through the platform `URL` |

No text from these sources is copied here; they describe the formats the code
reads.
