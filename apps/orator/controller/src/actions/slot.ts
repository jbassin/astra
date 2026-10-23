import {
  action,
  type KeyDownEvent,
  SingletonAction,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";

import type { OratorController } from "../controller";
import type { SlotSettings } from "../settings";

/**
 * The one workhorse action. Users place it across the deck; the controller decides what each
 * instance shows (collection / tag / track / nav) based on the current navigation level and the
 * key's coordinates. This class is a thin shim that forwards lifecycle events to the controller.
 */
@action({ UUID: "com.astra.orator.slot" })
export class Slot extends SingletonAction<SlotSettings> {
  private readonly controller: OratorController;

  constructor(controller: OratorController) {
    super();
    this.controller = controller;
  }

  override onWillAppear(ev: WillAppearEvent<SlotSettings>): Promise<void> {
    return this.controller.onWillAppear(ev);
  }

  override onWillDisappear(ev: WillDisappearEvent<SlotSettings>): void {
    this.controller.onWillDisappear(ev);
  }

  override onKeyDown(ev: KeyDownEvent<SlotSettings>): Promise<void> {
    return this.controller.onKeyDown(ev);
  }
}
