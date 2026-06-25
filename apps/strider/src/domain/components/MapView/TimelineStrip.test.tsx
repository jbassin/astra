import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Layer } from "@/domain/lib/regions";
import { imperialDate } from "@/domain/lib/timeline";
import TimelineStrip from "./TimelineStrip";

function makeLayer(overrides: Partial<Layer> = {}): Layer {
  return {
    slug: "one",
    timestamp: "863-07-13T14:21:00Z",
    message: "Hildebrandt arrives on the strider",
    changes: [],
    ...overrides,
  };
}

const twoLayers = [
  makeLayer(),
  makeLayer({
    slug: "two",
    timestamp: "863-07-14T09:00:00Z",
    message: "Iconoclasm builds their fane.",
  }),
];

// Renders TimelineStrip with sane defaults so each test only states what it cares about.
function renderStrip(props: Partial<React.ComponentProps<typeof TimelineStrip>> = {}) {
  return render(
    <TimelineStrip
      layers={twoLayers}
      index={1}
      isPlaying={false}
      dwellMs={500}
      onIndexChange={() => {}}
      onSkipToEnd={() => {}}
      onReplay={() => {}}
      {...props}
    />,
  );
}

describe("TimelineStrip", () => {
  it("renders only the VOX-INACTIVE entry at index 0", () => {
    renderStrip({ index: 0 });
    expect(screen.queryByText("++ VOX-INACTIVE ++")).not.toBeNull();
    expect(screen.queryByText("Hildebrandt arrives on the strider")).toBeNull();
    expect(screen.queryByText("Iconoclasm builds their fane.")).toBeNull();
  });

  it("stacks both layer messages plus VOX-INACTIVE at the full index, newest first", () => {
    renderStrip({ index: 2 });
    expect(screen.queryByText("Iconoclasm builds their fane.")).not.toBeNull();
    expect(screen.queryByText("Hildebrandt arrives on the strider")).not.toBeNull();
    expect(screen.queryByText("++ VOX-INACTIVE ++")).not.toBeNull();
  });

  it("formats layer timestamps in Imperial M.YYY.DDD +HHMMhrs form", () => {
    renderStrip({ index: 2 });
    expect(screen.queryByText("M.863.194 +1421hrs")).not.toBeNull();
    expect(screen.queryByText("M.863.195 +0900hrs")).not.toBeNull();
  });

  it("renders position count in the footer", () => {
    renderStrip({ index: 1 });
    expect(screen.queryByText("1/2")).not.toBeNull();
  });

  it("caps visible entries at VISIBLE_SLOTS (5) when history exceeds it", () => {
    const many: Layer[] = Array.from({ length: 8 }, (_, i) =>
      makeLayer({
        slug: `l${i}`,
        timestamp: `863-07-13T${String(10 + i).padStart(2, "0")}:00:00Z`,
        message: `event-${i}`,
      }),
    );
    renderStrip({ layers: many, index: 8 });
    // 8 layers, index 8 (latest applied) — newest 5 events visible, older unmounted.
    expect(screen.queryByText("event-7")).not.toBeNull();
    expect(screen.queryByText("event-6")).not.toBeNull();
    expect(screen.queryByText("event-5")).not.toBeNull();
    expect(screen.queryByText("event-4")).not.toBeNull();
    expect(screen.queryByText("event-3")).not.toBeNull();
    expect(screen.queryByText("event-2")).toBeNull();
    expect(screen.queryByText("event-1")).toBeNull();
    expect(screen.queryByText("event-0")).toBeNull();
    expect(screen.queryByText("++ VOX-INACTIVE ++")).toBeNull();
  });

  describe("imperialDate", () => {
    it("transforms ISO timestamp to Imperial form with day-of-year and 24h time", () => {
      expect(imperialDate("863-07-13T14:21:00Z")).toBe("M.863.194 +1421hrs");
      expect(imperialDate("863-01-01T00:00:00Z")).toBe("M.863.001 +0000hrs");
      expect(imperialDate("863-12-31T23:59:00Z")).toBe("M.863.365 +2359hrs");
    });
  });

  it("keeps the arrows usable while playing (manual stepping interrupts playback)", () => {
    renderStrip({ index: 1, isPlaying: true });
    expect((screen.getByLabelText("Previous layer") as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByLabelText("Next layer") as HTMLButtonElement).disabled).toBe(false);
  });

  it("disables prev at index 0 and next at index === layers.length", () => {
    const { rerender } = renderStrip({ index: 0 });
    expect((screen.getByLabelText("Previous layer") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("Next layer") as HTMLButtonElement).disabled).toBe(false);

    rerender(
      <TimelineStrip
        layers={twoLayers}
        index={2}
        isPlaying={false}
        dwellMs={500}
        onIndexChange={() => {}}
        onSkipToEnd={() => {}}
        onReplay={() => {}}
      />,
    );
    expect((screen.getByLabelText("Previous layer") as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByLabelText("Next layer") as HTMLButtonElement).disabled).toBe(true);
  });

  it("calls onIndexChange with neighboring index on arrow click", () => {
    const onChange = vi.fn();
    renderStrip({ index: 1, onIndexChange: onChange });
    screen.getByLabelText("Previous layer").click();
    screen.getByLabelText("Next layer").click();
    expect(onChange).toHaveBeenNthCalledWith(1, 0);
    expect(onChange).toHaveBeenNthCalledWith(2, 2);
  });

  it("shows a skip-to-now action while playing and calls onSkipToEnd", () => {
    const onSkip = vi.fn();
    renderStrip({ index: 1, isPlaying: true, onSkipToEnd: onSkip });
    const action = screen.getByLabelText("Skip to the current state");
    action.click();
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it("offers replay only at rest on the current state and calls onReplay", () => {
    const onReplay = vi.fn();
    renderStrip({ index: 2, isPlaying: false, onReplay });
    const action = screen.getByLabelText("Replay the full vox-log");
    action.click();
    expect(onReplay).toHaveBeenCalledOnce();
  });
});
