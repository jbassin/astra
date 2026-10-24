import { defineSiteVitestConfig } from "@astra/site-kit/vitest";

// No generated content: vellum's editor state is all runtime and localStorage.
export default defineSiteVitestConfig({ root: import.meta.dirname, generatedContent: false });
