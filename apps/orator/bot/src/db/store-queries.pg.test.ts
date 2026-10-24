/**
 * How many statements the batched store methods send to a real Postgres (SVC-10's N+1 list).
 * Each count is the number of statements postgres.js sends, transaction `begin`/`commit` included.
 * Runs only under `just pg-test` (a throwaway Postgres); never point it at the live database.
 *
 * Measured before the batching, on the same data: the track page sent 30 statements (one tags
 * query per track, run in parallel, plus setup on the extra pooled connections that opened),
 * tagging 20 tracks with 2 tags sent 42 (one insert per pair, plus begin and commit), untagging 20
 * tracks from 1 tag sent 22, and saving a 20-item playlist sent 24 (one insert per item).
 */
import {
  createScratchDatabase,
  type ScratchDatabase,
  TEST_DATABASE_URL,
} from "@astra/pg-migrate/testing";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { PostgresStore } from "./store";

const TRACKS = 20;

describe.skipIf(TEST_DATABASE_URL === undefined)("PostgresStore query counts", () => {
  let db: ScratchDatabase;
  let store: PostgresStore;
  const queries: string[] = [];
  const trackIds: number[] = [];
  let tagIds: number[] = [];

  /** The statements `fn` sends. */
  async function count(fn: () => Promise<unknown>): Promise<number> {
    queries.length = 0;
    await fn();
    return queries.length;
  }

  beforeAll(async () => {
    db = await createScratchDatabase(TEST_DATABASE_URL ?? "");
    store = new PostgresStore(db.url, { onQuery: (q) => queries.push(q) });
    await store.migrate();
    for (let i = 0; i < TRACKS; i++)
      trackIds.push((await store.createTrack({ title: `T${i}`, sourceType: "upload" })).id);
    tagIds = [(await store.upsertTag("calm")).id, (await store.upsertTag("boss")).id];
  });

  afterAll(async () => {
    await store.close();
    await db.drop();
  });

  test("tagging (20 tracks x 2 tags) and untagging are one statement each, not 42 and 22", async () => {
    let added = 0;
    expect(await count(async () => (added = await store.addTagsToTracks(trackIds, tagIds)))).toBe(
      1,
    );
    expect(added).toBe(TRACKS * 2);
    // A repeat adds nothing, and repeated ids in one call count once.
    expect(await store.addTagsToTracks([...trackIds, ...trackIds], tagIds)).toBe(0);

    let removed = 0;
    expect(
      await count(
        async () => (removed = await store.removeTagsFromTracks(trackIds, [tagIds[0] ?? 0])),
      ),
    ).toBe(1);
    expect(removed).toBe(TRACKS);
    await store.addTagsToTracks(trackIds, tagIds);
  });

  test("a page of 20 tracks with their tags is 2 statements, not 30", async () => {
    let page: Awaited<ReturnType<PostgresStore["listTracks"]>> = [];
    let tags = new Map<number, unknown[]>();
    const n = await count(async () => {
      page = await store.listTracks({ limit: 200 });
      tags = await store.tagsForTracks(page.map((t) => t.id));
    });
    expect(n).toBe(2);
    expect(page).toHaveLength(TRACKS);
    for (const t of page) expect(tags.get(t.id)).toHaveLength(2);
    // Same tags, same order as the per-track query the single-track routes still use.
    const first = page[0]?.id ?? 0;
    expect(tags.get(first)).toEqual(await store.tagsForTrack(first));
    expect(await store.tagsForTracks([])).toEqual(new Map());
  });

  test("saving a 21-item playlist is 5 statements, in order, repeats kept", async () => {
    const p = await store.createPlaylist("Order");
    const items = [...trackIds].reverse();
    items.push(items[0] ?? 0);
    // begin, delete, one insert, touch updated_at, commit.
    expect(await count(() => store.setPlaylistItems(p.id, items))).toBe(5);
    expect(await store.playlistTrackIds(p.id)).toEqual(items);
    await store.setPlaylistItems(p.id, []);
    expect(await store.playlistTrackIds(p.id)).toEqual([]);
  });
});
