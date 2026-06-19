import type { Preview } from "@storybook/react";
import "../src/theme.css";

/**
 * The `mode` toolbar flips the mechanical/diegetic theme axis globally; vellum
 * stories re-parse with it (the axis is a parse/viewer setting, not in-document).
 * Everything renders on the void background in the body face.
 */
const preview: Preview = {
  globalTypes: {
    mode: {
      description: "vellum theme axis",
      defaultValue: "mechanical",
      toolbar: {
        title: "Mode",
        icon: "mirror",
        items: [
          { value: "mechanical", title: "Mechanical (teal)" },
          { value: "diegetic", title: "Diegetic (parchment)" },
        ],
        dynamicTitle: true,
      },
    },
  },
  parameters: {
    layout: "fullscreen",
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-void p-8 font-body text-ink">
        <Story />
      </div>
    ),
  ],
};

export default preview;
