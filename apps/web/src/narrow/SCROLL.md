# Scroll effort on this page

The last panel on `/dev/narrow`. It counts how far down the page its
headings, its send buttons and its last control sit, in screens of the
window as it is now. Each screen is a swipe, a few turns of a wheel or a
Page Down, which can cost a lot for a person who scrolls with effort.

## How it counts

`scrollInPage` (scroll-inpage.ts) reads, without scrolling or moving focus:

- the window size and the page height;
- each visible heading (`h1` to `h6`, or `role="heading"` with its
  `aria-level`), with its place on the page and whether it is in main;
- the buttons that send a form, and the last control by its place on the
  page;
- links back to the top (`#`, `#top`, or a link far down to a place near the
  top);
- the height that wide fixed or sticky bars cover at the top and at the
  bottom of the window now.

The panel itself is left out.

`scroll-effort.ts` counts in the part of the window that the bars leave
free. A place is "on the first screen" when its top shows without scrolling;
otherwise it is counted up to the next tenth of a screen. The longest
stretch with no heading runs from the top of the page, between headings, to
the end of the page.

It also gives how far down the first heading inside main is. It points to: a page longer than 8 screens, main content starting more than a screen down, a stretch with no heading longer
than 3 screens, a page with no heading at all, bars covering a quarter of the
window or more, no way back to the top on a page longer than 3 screens, and a
send button more than 3 screens down. With no window size, or bars covering
the whole window, the result is UNKNOWN.

Screens are a measure of the page, not of how anyone scrolls: how far one
swipe or one key press goes differs from device to device, and the panel
says so.

## What was checked, and what was not

- Unit tests: scroll-effort.test.ts, scroll-panel.test.ts; jsdom:
  scroll-inpage.dom.test.ts and the page tests in NarrowAuditPage.dom.test.tsx.
- e2e-scroll.test.ts (with `NARROW_E2E=1`): on a long test page in Chromium,
  the headings, send button, last control and fixed bars are read as laid
  out, the same at two scroll positions, and the page is not moved. The
  panel states have no measured failure under the browser checks of this
  module.
- e2e/narrow-scroll.spec.ts: on the built app at 320 by 640 pixels, the
  count, keyboard use and French.

Not checked: other browsers, scroll containers inside the page (only the
page itself is counted), and pages that load more content as they scroll.
