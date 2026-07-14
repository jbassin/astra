// The `createServerFn` wrapper the browser calls — kept minimal (ONLY the
// `createServerFn` definition, same shape `corpusFns.ts`'s own header comment
// documents) so the real logic (`recordSearchEvent`) stays unit-testable
// without the RPC machinery.

import { createServerFn } from "@tanstack/react-start";

import { recordSearchEvent, type SearchSurface } from "./telemetry";

export const recordSearch = createServerFn({ method: "POST" })
  .validator((input: { surface: SearchSurface }) => input)
  .handler(({ data }): void => recordSearchEvent(data.surface));
