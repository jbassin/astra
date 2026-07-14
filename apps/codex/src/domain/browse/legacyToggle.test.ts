// @vitest-environment jsdom
//
// codex's app-wide default is plain "node" (see `vitest.config.ts`); this
// file needs real `localStorage`/`window.location`/`history` + a
// `useSyncExternalStore` render (`renderHook`), so it opts into jsdom
// per-file.

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  _resetLegacyToggleForTests,
  getLegacySnapshot,
  initLegacyToggle,
  setLegacyToggle,
  useLegacyToggle,
} from "./legacyToggle";

describe("legacyToggle (D29-35 site-wide toggle, M4 precedence)", () => {
  beforeEach(() => {
    localStorage.clear();
    _resetLegacyToggleForTests();
  });
  afterEach(() => {
    localStorage.clear();
    _resetLegacyToggleForTests();
  });

  it("defaults to off with no stored preference and no URL param", () => {
    initLegacyToggle(false);
    expect(getLegacySnapshot()).toBe(false);
  });

  it("a `legacy=1` URL param on initial load wins over an absent stored preference", () => {
    initLegacyToggle(true);
    expect(getLegacySnapshot()).toBe(true);
  });

  it("a stored preference persists across a load with no URL param", () => {
    setLegacyToggle(true);
    _resetLegacyToggleForTests(); // simulate a fresh module load (storage survives)
    initLegacyToggle(false);
    expect(getLegacySnapshot()).toBe(true);
  });

  it("initLegacyToggle is idempotent — a second call never re-applies URL-wins", () => {
    initLegacyToggle(true);
    setLegacyToggle(false); // user explicitly turns it off after load
    initLegacyToggle(true); // a stray second call (e.g. a remount) must NOT flip it back on
    expect(getLegacySnapshot()).toBe(false);
  });

  it("setLegacyToggle persists to localStorage", () => {
    initLegacyToggle(false);
    setLegacyToggle(true);
    expect(localStorage.getItem("codex:legacy")).toBe("1");
    setLegacyToggle(false);
    expect(localStorage.getItem("codex:legacy")).toBeNull();
  });

  it("useLegacyToggle re-renders subscribers on a setLegacyToggle write", () => {
    initLegacyToggle(false);
    const { result } = renderHook(() => useLegacyToggle());
    expect(result.current).toBe(false);
    act(() => setLegacyToggle(true));
    expect(result.current).toBe(true);
  });

  it("a broken localStorage (throws) fails soft to off, never throws", () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error("storage disabled");
    };
    try {
      expect(() => initLegacyToggle(false)).not.toThrow();
      expect(getLegacySnapshot()).toBe(false);
    } finally {
      Storage.prototype.getItem = original;
    }
  });

  it("the module's own eager, module-eval-time seed reads a `legacy=1` URL param (the real M4 mechanism, not just the exported function)", async () => {
    history.pushState({}, "", "/feat?legacy=1");
    try {
      vi.resetModules();
      const fresh = await import("./legacyToggle");
      expect(fresh.getLegacySnapshot()).toBe(true);
    } finally {
      history.pushState({}, "", "/");
      vi.resetModules();
    }
  });
});
