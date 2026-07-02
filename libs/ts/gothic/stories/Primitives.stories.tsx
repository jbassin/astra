import type { Meta, StoryObj } from "@storybook/react";

import { identityStyle } from "../src/identity";
import { Button, Columns, Input, Panel, Title } from "../src/primitives";

const meta: Meta = { title: "Primitives" };
export default meta;
type Story = StoryObj;

export const Typography: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <Title level={1}>Cogitator Dataslate</Title>
      <Title level={2}>Section Header</Title>
      <Title level={3}>Subsection</Title>
    </div>
  ),
};

export const Panels: Story = {
  render: () => (
    <div className="flex gap-4">
      <Panel className="w-64">A panel on the void.</Panel>
      <Panel tone="elevated" className="w-64">
        An elevated panel.
      </Panel>
    </div>
  ),
};

export const Buttons: Story = {
  render: () => (
    <div className="flex gap-3">
      <Button variant="solid">Engage</Button>
      <Button variant="ghost">Stand down</Button>
    </div>
  ),
};

export const Inputs: Story = {
  render: () => (
    <div className="w-80">
      <Input placeholder="Enter the second cipher…" />
    </div>
  ),
};

export const Grid: Story = {
  render: () => (
    <Columns count={3}>
      <Panel>One</Panel>
      <Panel>Two</Panel>
      <Panel>Three</Panel>
    </Columns>
  ),
};

/** I5: per-player identity color applied as a runtime CSS var (not a token). */
export const IdentityColor: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <span style={identityStyle("#6dd5c0")} className="text-[var(--identity-color)]">
        Player Alpha (teal)
      </span>
      <span style={identityStyle("#f0b46e")} className="text-[var(--identity-color)]">
        Player Beta (amber)
      </span>
      <span style={identityStyle(null)} className="text-[var(--identity-color)]">
        Guest — no color, visible fallback
      </span>
    </div>
  ),
};
