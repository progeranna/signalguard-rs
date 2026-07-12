import { describe, expect, it } from "vitest";

import { parseUiMode } from "./types";

describe("parseUiMode", () => {
  it.each([
    ["demo", "demo"],
    ["live", "live"],
    [null, null],
    [undefined, null],
    ["", null],
    ["preview", null],
    ["DEMO", null],
    [" live ", null],
  ] as const)("parses %s as %s", (value, expected) => {
    expect(parseUiMode(value)).toBe(expected);
  });
});
