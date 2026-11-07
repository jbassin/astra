import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describeSsrSmoke } from "@astra/site-kit/ssrSmoke";
import { vi } from "vitest";

// The smoke renders through the built server in a child process that inherits this env: a
// temp data root with one invited player, and a DM token, so nothing reads
// /ruby/data/astra-state or needs SOPS.
const dataRoot = mkdtempSync(path.join(tmpdir(), "builder-smoke-"));
const PLAYER_ID = "SmokeTestPlayer0000000";
const DM_TOKEN = "smoke-dm-token";
mkdirSync(path.join(dataRoot, "builder", "characters"), { recursive: true });
writeFileSync(
  path.join(dataRoot, "builder", "roster.json"),
  JSON.stringify([{ id: PLAYER_ID, name: "Smoke Tester", createdAt: "2026-11-06T12:00:00.000Z" }]),
);
writeFileSync(
  path.join(dataRoot, "builder", "characters", `${PLAYER_ID}.json`),
  JSON.stringify({
    schemaVersion: 1,
    updatedAt: "2026-11-06T12:30:00.000Z",
    answers: { archetype: "scoundrel", name: "Quill" },
  }),
);
vi.stubEnv("ASTRA_DATA_ROOT", dataRoot);
vi.stubEnv("BUILDER_DM_TOKEN", DM_TOKEN);

describeSsrSmoke({
  appRoot: path.resolve(import.meta.dirname, ".."),
  routes: [
    { path: "/", contains: ["Character builder", "personal link"] },
    {
      path: `/c/${PLAYER_ID}`,
      contains: ["Smoke Tester", 'checked="" value="scoundrel"', 'value="Quill"'],
    },
    { path: `/c/${"A".repeat(22)}`, status: 404, contains: ["We couldn’t find that character"] },
    { path: "/c/not-an-id", status: 404, contains: ["We couldn’t find that character"] },
    { path: "/dm/wrong", status: 404, contains: ["That page doesn’t exist."] },
    { path: `/dm/${DM_TOKEN}`, contains: ["Players", "Smoke Tester", "Quill", "1 invited"] },
    { path: "/__no-such-page", status: 404, contains: ["That page doesn’t exist."] },
  ],
});
