# Paste a point

One field that reads a place written in the ways people actually write it, and fills the two
near-me fields (latitude, longitude) when the person presses "Use this point". It also shows the
point already in the fields in five other forms, to read aloud or type into another program.

Nothing is sent anywhere. The reader looks only at the pasted text.

## Files

| File | What it does |
| --- | --- |
| `pointRead.ts` | `readPoint(text)` returns `none`, `invalid` with a problem, or `ok` with a point, the format and whether the order was swapped. `normalisePointText` makes dashes, marks and spaces plain. |
| `pointFormat.ts` | `formatPointAs(point, style, locale)` writes a point as decimal, hemisphere, degrees and minutes, degrees minutes and seconds, or a geo link. `splitDm` and `splitDms` carry so 60 is never shown. |
| `pointCopy.ts` | English and French words: one message per problem, "Read as ...", format and style names, the help text. |
| `PointPaste.tsx` | The field, the live line, the button and the list of other forms. |
| `PackPlaces.tsx` | Mounts `PointPaste` in the near-me group and wires it to the two fields. |

## What is read

| Written as | Example | Format |
| --- | --- | --- |
| Decimal degrees | `43.65, -79.38`, `43,65 ; -79,38` | `decimal` |
| Degrees with a hemisphere | `43.65 N, 79.38 W`, `43,65 N ; 79,38 O`, `north 43.65 west 79.38` | `hemisphere` |
| Degrees and minutes | `43° 39.0′ N, 79° 22.8′ W`, `43 39, -79 22` | `dm` |
| Degrees, minutes, seconds | `43° 39′ 0″ N, 79° 22′ 48″ W` | `dms` |
| Labelled numbers | `lat 43.65 lon -79.38`, `lon -79.38 lat 43.65` | as the numbers |
| A geo link | `geo:43.65,-79.38`, `geo:43.65,-79.38,76?z=14` | `geo-link` |
| A web map link | a link holding `mlat` and `mlon`, `#map=Z/lat/lon`, `/@lat,lon`, or `q`, `ll`, `query`, `center`, `loc` as `lat,lon` | `map-link` |

A web link is read for its numbers only. Its host and path words are never read, so a link to any
map service gives the same point, and a host such as `192.168.1.1` is never taken for a point.

## Rules that keep it from guessing

- Ambiguous text is refused with a reason. There are eleven problems, each with a sentence in both
  languages.
- A minus sign belongs to the whole coordinate: `-79 22` is minus 79 degrees and 22 minutes.
- A minus sign and a letter S or W together are refused.
- Both coordinates must use the same number of parts.
- Minutes and seconds must be under 60. Degrees must be whole when minutes follow, and minutes
  must be whole when seconds follow.
- At most three digits before the decimal mark, so `0043.65` is refused.
- Text over 300 characters is refused.
- Only plain numbers are read: no thousands separators, no exponents.
- If the first number is over 90 and the second is not, and nothing says which is which, the pair
  is read as longitude first, `swapped` is true, and the person is told to check. Labels and
  letters are never overridden.
- Output is rounded to six decimals and must pass `isPoint`.

## What the button does

The button appears only when the text reads. Pressing it puts the point into the two fields as text
with five decimals (about one metre), clears the pasted text, and says the fields are filled. The
pasted text is not kept. The list of other forms follows the typed fields, so it also shows a point
typed by hand, and disappears when the fields do not hold a good point.

## Accessibility

- The field has a visible label, a description, and an error that the field points to.
- The reading is a paragraph with `aria-live="polite"`. It is not a `role="status"`, so the page's
  own status line stays the only one.
- There is no heading, so the block fits under any heading level.
- The button is a real button that does not submit a form.
- The block carries `lang` for the current language.

## Tests

- `pointRead.test.ts`, `pointRead.edges.test.ts`: every format, every problem, every boundary.
- `pointRead.fuzz.test.ts`: random text never throws, always has a known shape, is quick on awkward
  text, round-trips 400 random points through five styles in two languages, and links never read
  the host.
- `pointFormat.test.ts`: each style, the carry at 60, French marks.
- `pointCopy.test.ts`: every string present, French typography, copy linter.
- `PointPaste.dom.test.tsx`: states, keyboard order, forms, axe in both languages.
- `PackPlaces.pointPaste.dom.test.tsx`: wiring into the places list, with the shipped pack.
- `pointRead.source.test.ts`: no network, storage, clock or random; no map service named; no
  banned words; French typography in the source.
