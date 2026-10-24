import { defineSiteVitestConfig } from "@astra/site-kit/vitest";

// The default environment is "node": the engine, server and quiz tests use real fs and real
// HTTP. The component tests opt into a DOM with a `// @vitest-environment jsdom` docblock.
export default defineSiteVitestConfig({
  root: import.meta.dirname,
  environment: "node",
  generatedContent: false,
});
