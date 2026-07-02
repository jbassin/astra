import { expect, test } from "vitest";

import { ping } from "./index";

test("ping returns pong", () => {
  expect(ping()).toBe("pong");
});
