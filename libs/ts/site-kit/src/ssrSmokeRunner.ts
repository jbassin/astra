// SSR smoke runner (`ssrSmoke.ts` spawns it): imports a built server bundle in a plain Node
// process, which is how production runs it, renders each path, and prints one JSON array of
// `{ path, status, html }`. Usage: node --import tsx ssrSmokeRunner.ts <bundle> <paths>

export interface SmokeResult {
  path: string;
  status: number;
  html: string;
}

async function main(): Promise<void> {
  const [bundle, pathsJson] = process.argv.slice(2);
  if (!bundle || !pathsJson) throw new Error("usage: ssrSmokeRunner.ts <bundle> <paths-json>");
  const mod = (await import(bundle)) as {
    default?: { fetch?: (req: Request) => Promise<Response> };
  };
  const ssr = mod.default;
  // createSsrServer relies on this export shape; a TanStack Start bump that changes it fails
  // here rather than in production.
  if (typeof ssr?.fetch !== "function") {
    throw new Error(`${bundle}: the default export has no fetch()`);
  }
  const render = ssr.fetch.bind(ssr);
  const results: SmokeResult[] = [];
  for (const p of JSON.parse(pathsJson) as string[]) {
    const res = await render(new Request(`http://localhost${p}`));
    results.push({ path: p, status: res.status, html: await res.text() });
  }
  // The bundle may hold open handles (timers, telemetry), so exit once stdout has drained; a
  // bare exit can cut off a large write to a pipe.
  process.stdout.write(JSON.stringify(results), () => process.exit(0));
}

await main();
