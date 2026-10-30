// The CSS custom properties akasha sets from React: `style={{ "--hue": section.hue }}` gives an
// element and its children a section's hue (see src/domain/lib/sections.ts).
import "react";

declare module "react" {
  interface CSSProperties {
    "--hue"?: string;
  }
}
