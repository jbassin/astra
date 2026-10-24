import { defineServerBundle } from "@astra/site-kit/bundle";

export default defineServerBundle({ root: import.meta.dirname, entry: "src/server.ts" });
