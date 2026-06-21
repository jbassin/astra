import { describe, expect, test } from "bun:test";
import { audioDestPath } from "./migrate";

describe("audioDestPath", () => {
  test("relocates a file to the dest audio dir by basename", () => {
    expect(audioDestPath("/ruby/.../lark/data/audio/BJ0STdjfAvE.webm", "/repo/data/audio")).toBe(
      "/repo/data/audio/BJ0STdjfAvE.webm",
    );
  });
  test("handles uuid m4a uploads", () => {
    expect(audioDestPath("/x/y/01d0863c.m4a", "/vol/audio")).toBe("/vol/audio/01d0863c.m4a");
  });
});
