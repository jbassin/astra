// @vitest-environment jsdom
/**
 * Join-card prefill from `?code=` (D31-12/spec S2 test list): the host lobby
 * QR encodes `<public-origin>/?code=<CODE>`, and the player view must read it
 * back into the join card's code field on load — `codeFromQuery` is the pure
 * parser (router.ts), this pins the `JoinCard` component actually uses it.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { JoinCard } from "../../src/player/JoinCard";
import { codeFromQuery } from "../../src/router";

afterEach(cleanup);

describe("codeFromQuery", () => {
  it("uppercases and extracts the code param", () => {
    expect(codeFromQuery("?code=wxyz")).toBe("WXYZ");
  });

  it("returns an empty string when the param is absent", () => {
    expect(codeFromQuery("")).toBe("");
    expect(codeFromQuery("?other=1")).toBe("");
  });
});

describe("JoinCard — code prefill", () => {
  it("prefills the code input from the ?code= query param", () => {
    render(
      <JoinCard
        initialCode={codeFromQuery("?code=wxyz")}
        pending={false}
        error={null}
        onJoin={vi.fn()}
      />,
    );
    const input = screen.getByLabelText("Game code") as HTMLInputElement;
    expect(input.value).toBe("WXYZ");
  });

  it("leaves the code input blank with no query param", () => {
    render(
      <JoinCard initialCode={codeFromQuery("")} pending={false} error={null} onJoin={vi.fn()} />,
    );
    const input = screen.getByLabelText("Game code") as HTMLInputElement;
    expect(input.value).toBe("");
  });

  it("submits the trimmed/uppercased code and name", () => {
    const onJoin = vi.fn();
    render(<JoinCard initialCode="WXYZ" pending={false} error={null} onJoin={onJoin} />);
    const nameInput = screen.getByLabelText("Your name");
    fireEvent.change(nameInput, { target: { value: "Ozzie" } });
    fireEvent.click(screen.getByRole("button", { name: "Join game" }));
    expect(onJoin).toHaveBeenCalledWith("WXYZ", "Ozzie");
  });

  it("shows a server error and disables submit while pending", () => {
    render(<JoinCard initialCode="WXYZ" pending={true} error="name-taken" onJoin={vi.fn()} />);
    expect(screen.getByRole("alert").textContent).toBe("name-taken");
    const button = screen.getByRole("button", { name: "Joining…" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
