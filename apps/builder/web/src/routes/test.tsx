import { createFileRoute } from "@tanstack/react-router";

import { TestBuilder } from "@/components/TestBuilder";

// Public practice mode: the same flow and sheet, with no server saves at all.
export const Route = createFileRoute("/test")({
  component: TestBuilder,
});
