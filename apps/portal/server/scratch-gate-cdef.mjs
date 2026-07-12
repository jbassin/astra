// Throwaway: 0028 S4 acceptance C/D/E/F programmatic half, via the PLAYER key.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const t = new StreamableHTTPClientTransport(new URL("https://portal.iridi.cc/mcp"), {
  requestInit: { headers: { Authorization: `Bearer ${process.env.portal_player_api_key}` } },
});
const c = new Client({ name: "astra-0028-gate-cdef", version: "0.0.1" });
await c.connect(t);

async function call(name, args) {
  const r = await c.callTool({ name, arguments: args });
  return { err: r.isError === true, text: r.content?.[0]?.text ?? "" };
}
const clip = (s, n = 400) => s.replaceAll("\n", " ⏎ ").slice(0, n);

// --- C: query-party ---
const party = await call("query-party", {});
console.log(`C party (${party.text.length} ch, err=${party.err}):\n${party.text}\n---`);

// --- D: query-player all 7 sections for Argyle ---
for (const section of ["summary", "stats", "skills", "spells", "feats", "inventory", "notes"]) {
  const r = await call("query-player", { name: "Argyle", section });
  console.log(`D argyle/${section}: ${r.text.length} ch, err=${r.err} | ${clip(r.text, 220)}`);
}
// spells drill-down (rank filter -> full detail path)
const drill = await call("query-player", { name: "Argyle", section: "spells", rank: 1 });
console.log(
  `D argyle/spells rank=1: ${drill.text.length} ch, err=${drill.err} | ${clip(drill.text, 220)}`,
);
// second PC summary
const johnny = await call("query-player", { name: "Johnny", section: "summary" });
console.log(
  `D johnny/summary: ${johnny.text.length} ch, err=${johnny.err} | ${clip(johnny.text, 200)}`,
);
// negative: the party actor uuid must refuse typed
const partyNeg = await call("query-player", { uuid: "Actor.xxxPF2ExPARTYxxx", section: "summary" });
console.log(`D party-actor refusal: err=${partyNeg.err} | ${clip(partyNeg.text, 160)}`);
// familiar accepted
const oth = await call("query-player", { name: "Othello", section: "summary" });
console.log(`D othello/summary: err=${oth.err} | ${clip(oth.text, 160)}`);

// --- E: query-rolls ---
const rolls = await call("query-rolls", { limit: 5 });
console.log(
  `E rolls page1 (${rolls.text.length} ch, err=${rolls.err}):\n${rolls.text.slice(0, 1400)}\n---`,
);
// cursor walk: parse nextCursor out of the rendered meta if present
const cursorMatch = rolls.text.match(/nextCursor[:=]\s*`?([^\s`]+)/i);
if (cursorMatch) {
  const page2 = await call("query-rolls", { limit: 5, cursor: cursorMatch[1] });
  console.log(
    `E rolls page2: ${page2.text.length} ch, err=${page2.err} | ${clip(page2.text, 200)}`,
  );
} else {
  console.log("E rolls page2: NO nextCursor found in page1 render — check render shape");
}
// filters
const filt = await call("query-rolls", { limit: 5, actor: "Argyle" });
console.log(`E rolls actor=Argyle: err=${filt.err} | ${clip(filt.text, 300)}`);

// --- F: query-item ---
const search = await call("query-item", { name: "dagger" });
console.log(`F item search 'dagger': err=${search.err} | ${clip(search.text, 400)}`);
const emb = await call("query-item", { name: "healing potion" });
console.log(`F item search 'healing potion': err=${emb.err} | ${clip(emb.text, 300)}`);

await c.close();
