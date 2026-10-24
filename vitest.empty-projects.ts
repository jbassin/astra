// Root globalSetup (vitest.config.ts): fail the run when a project has no test files. vitest
// itself fails only when the whole run finds none, so one empty package among 28 would pass
// silently. The check globs each project's own include/exclude, so a filtered run (`vitest run
// <path>`) still checks every project.
import type { TestProject } from "vitest/node";

// Project name -> why it may have no test files. Keep it empty unless a package truly has
// nothing to test.
const ALLOWED_EMPTY: Record<string, string> = {};

export default async function setup(root: TestProject): Promise<void> {
  const empty: string[] = [];
  await Promise.all(
    root.vitest.projects.map(async (project) => {
      const { testFiles } = await project.globTestFiles();
      if (testFiles.length === 0 && !(project.name in ALLOWED_EMPTY)) empty.push(project.name);
    }),
  );
  if (empty.length > 0) {
    throw new Error(
      `vitest projects with no test files: ${empty.toSorted().join(", ")}. Add a test, or ` +
        "list the project in ALLOWED_EMPTY (vitest.empty-projects.ts) with the reason.",
    );
  }
}
