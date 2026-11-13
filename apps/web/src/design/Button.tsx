import type { Ref } from "react";
import { Button as AriaButton, type ButtonProps } from "react-aria-components";

type Variant = "primary" | "secondary" | "quiet";

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonProps & { variant?: Variant; ref?: Ref<HTMLButtonElement> }) {
  return <AriaButton {...props} className={["btn", `btn-${variant}`, className].filter(Boolean).join(" ")} />;
}
