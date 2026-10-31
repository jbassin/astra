import { describe, expect, test } from "vitest";

import { collectImages, imageSrcProblem, isAssetPath } from "./images";
import { parseDocument } from "./parse";

const ASSETS = new Set(["althane.png", "maps/calaria.jpeg"]);

describe("isAssetPath", () => {
  test.each(["althane.png", "maps/calaria.jpeg", "a_b-c.1.WEBP", "x.gif", "y.jpg"])(
    "accepts %s",
    (path) => expect(isAssetPath(path)).toBe(true),
  );
  test.each([
    "../secret.png",
    "maps/../althane.png",
    ".hidden.png",
    "map of althane.png",
    "icon.svg",
    "notes.txt",
    "noext",
    "maps//a.png",
    "",
  ])("rejects %j", (path) => expect(isAssetPath(path)).toBe(false));
});

describe("imageSrcProblem", () => {
  test("a shipped asset path has no problem", () => {
    expect(imageSrcProblem("althane.png", ASSETS)).toBeNull();
    expect(imageSrcProblem("maps/calaria.jpeg", ASSETS)).toBeNull();
  });
  test.each([
    "https://i.imgur.com/a.png",
    "http://x/a.png",
    "//cdn.example/a.png",
    "data:image/png;base64,AA",
  ])("flags external %s", (src) => expect(imageSrcProblem(src, ASSETS)).toMatch(/^external image/));
  test("flags a leading slash", () => {
    expect(imageSrcProblem("/althane.png", ASSETS)).toMatch(/without a leading \//);
  });
  test("flags a bad path form", () => {
    expect(imageSrcProblem("../althane.png", ASSETS)).toMatch(/not an asset path/);
    expect(imageSrcProblem("icon.svg", ASSETS)).toMatch(/not an asset path/);
  });
  test("flags a missing file", () => {
    expect(imageSrcProblem("lost.png", ASSETS)).toMatch(/no such file/);
  });
});

describe("collectImages", () => {
  test("finds images in prose, blocks, fields, timelines and columns, in order", () => {
    const doc = parseDocument(`![one](a.png)

:::handout[Note]
![two](b.png)
:::

:::fields
Sigil :: ![three](c.png)
:::

:::timeline
- {Year 1} ![four](d.png)
:::

::::columns
:::column
![five](e.png)
:::
::::
`);
    expect(collectImages(doc).map((i) => i.alt)).toEqual(["one", "two", "three", "four", "five"]);
  });
});
