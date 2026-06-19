import { expect, test } from "bun:test";

import { ping } from "./index";

test("ping returns pong", () => {
  expect(ping()).toBe("pong");
});
