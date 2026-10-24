/// <reference types="vite/client" />
import { SiteDocument, siteHead } from "@astra/site-kit/document";
import { createRootRoute, Outlet } from "@tanstack/react-router";

import PixiHost from "@/components/PixiHost/PixiHost";
import { EntitiesObservedProvider } from "@/components/SiteHeader/entitiesObserved";
import SiteHeader from "@/components/SiteHeader/SiteHeader";

import "@astra/site-kit/theme";

import "@/styles/globals.css";

export const Route = createRootRoute({
  head: () => siteHead({ title: "The Strider", description: "Faction map of The Strider" }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <SiteDocument rum={() => import("@/observe/rumConfig")}>
      <PixiHost>
        <EntitiesObservedProvider>
          <SiteHeader />
          <Outlet />
        </EntitiesObservedProvider>
      </PixiHost>
    </SiteDocument>
  );
}
