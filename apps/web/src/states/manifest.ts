/**
 * Web app manifest. No icons are declared because the package ships no image assets;
 * a deployment adds its own. Colours come from the AA-checked palette.
 */
import type { Locale } from "./stateCopy";
import { STATE_PALETTE } from "./contrast";
import { message } from "./messages";
import { hrefFor } from "./router";

export interface WebManifest {
  readonly id: string;
  readonly name: string;
  readonly short_name: string;
  readonly lang: Locale;
  readonly dir: "ltr";
  readonly start_url: string;
  readonly scope: string;
  readonly display: "standalone";
  readonly background_color: string;
  readonly theme_color: string;
}

export function buildManifest(locale: Locale): WebManifest {
  const body = STATE_PALETTE.light.roles.body;
  const name = message("app.name", locale);
  return {
    id: "/",
    name,
    short_name: name,
    lang: locale,
    dir: "ltr",
    start_url: hrefFor(locale, "search"),
    scope: "/",
    display: "standalone",
    background_color: body.bg,
    theme_color: body.bg,
  };
}
