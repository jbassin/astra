import streamDeck from "@elgato/streamdeck";

import { Slot } from "./actions/slot";
import { OratorController } from "./controller";

streamDeck.logger.setLevel("info");

const controller = new OratorController();

streamDeck.actions.registerAction(new Slot(controller));

streamDeck.connect().then(() => controller.init());
