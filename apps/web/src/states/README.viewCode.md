# View codes

A view code is plain text for the pack places page: the search words, the wheelchair tag, the kind
and the source, licence, tier and age filters. The page shows the code for the current view in a
read-only box (select it to copy), and a pasted code is read back with a button.

```
VIEW v1
search: ramp main
tag: yes
kind: cafe
licence: ODbL-1.0
```

- It holds nothing about the person. The typed starting point and the distance band are never written.
- Reading is careful. A line it cannot use (an unknown key, a value the page does not offer, a key
  written twice, an empty value) is left out and listed by its key. Nothing is guessed.
- A kind is not checked against the pack: a kind the pack does not hold simply shows no places.
- Nothing changes until "Use this view" is pressed. Anything the code does not set goes back to its
  default, and a chosen distance band is cleared. The typed starting point is kept.
- At most 2,000 characters and 20 lines of a paste are read; the rest is dropped without a notice.
- Typed search words are never passed through the French typography; they are written and read raw.

Files: `viewCode.ts` (write and read), `viewCodeCopy.ts` (EN/FR words), `ViewCode.tsx` (the closed
section), mounted in `PackPlaces.tsx` before the outing planner. No storage, no network, no new keys.

Size: the section is kept small on purpose. Main had very little install budget left, and this
feature costs about 3.3 KB of it (see the PR for the measured numbers).
