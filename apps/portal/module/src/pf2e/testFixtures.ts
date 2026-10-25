/**
 * Test-only loaders for the dual-sided pf2e fixtures in `tests/fixtures/pf2e/`. Each fixture
 * holds both sides of one document: `source` (what `toObject()` returns) and `live` (the
 * prepared `system` tree, plus the prepared `system` of any embedded item a handler reads
 * live). {@link fixtureDocument} turns one into a fake document whose `toObject()` returns the
 * source and whose `system` and `items.get()` return the live side, the way real Foundry does.
 * Nothing in the module bundle imports this file.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type Pf2eFixtureName = "pc" | "npc" | "spell" | "feat" | "item";

interface Pf2eFixture {
  /** Where each side came from, and whether it was captured or synthesized. */
  provenance: string;
  uuid: string;
  source: Record<string, unknown>;
  live: {
    system: Record<string, unknown>;
    items?: Record<string, { system: Record<string, unknown> }>;
  };
}

function loadPf2eFixture(name: Pf2eFixtureName): Pf2eFixture {
  const path = fileURLToPath(new URL(`../../tests/fixtures/pf2e/${name}.json`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as Pf2eFixture;
}

/** A fake prepared document built from a fixture: `toObject()` hands back a fresh clone of
 * the source, `system` is the live tree, and `items.get(id)` returns the live embedded item
 * (its `system` from `live.items`, falling back to the item's source `system`). */
export function fixtureDocument(name: Pf2eFixtureName): FoundryActor {
  const fixture = loadPf2eFixture(name);
  const { source, live } = fixture;
  const documentName = fixture.uuid.includes(".Item.") ? "Item" : "Actor";
  const sourceItems = Array.isArray(source.items)
    ? (source.items as Record<string, unknown>[])
    : [];
  const liveItem = (id: string): FoundryDocumentLike | undefined => {
    const itemSource = sourceItems.find((i) => i._id === id);
    if (!itemSource) return undefined;
    return {
      id,
      uuid: `${fixture.uuid}.Item.${id}`,
      name: String(itemSource.name),
      documentName: "Item",
      type: String(itemSource.type),
      system: live.items?.[id]?.system ?? (itemSource.system as Record<string, unknown>),
      toObject: () => structuredClone(itemSource),
    };
  };
  return {
    id: String(source._id),
    uuid: fixture.uuid,
    name: String(source.name),
    documentName,
    type: String(source.type),
    folder: null,
    flags: source.flags as Record<string, unknown> | undefined,
    system: live.system,
    items: { get: liveItem },
    toObject: () => structuredClone(source),
    getTokenDocument: () => Promise.reject(new Error("not used by fixture tests")),
    createEmbeddedDocuments: () => Promise.reject(new Error("not used by fixture tests")),
    increaseCondition: () => Promise.resolve(null),
    decreaseCondition: () => Promise.resolve(),
    toggleCondition: () => Promise.resolve(),
    itemTypes: { condition: [] },
  };
}
