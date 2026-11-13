/** @vitest-environment jsdom */
import { render } from "@testing-library/react";
import axe from "axe-core";
import { describe, expect, it } from "vitest";
import { ChoiceGroup } from "./fields.tsx";

describe("choice group", () => {
  it("exposes a name and has no axe violations in the fragment", async () => {
    document.documentElement.lang = "en";
    const view = render(
      <ChoiceGroup
        label="Equipment"
        value=""
        onChange={() => undefined}
        options={[
          { value: "", label: "No answer" },
          { value: "manual_chair", label: "Manual wheelchair" },
        ]}
      />,
    );
    expect(view.getByRole("radiogroup", { name: "Equipment" })).toBeTruthy();
    const results = await axe.run(view.container, {
      rules: { region: { enabled: false }, "color-contrast": { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
