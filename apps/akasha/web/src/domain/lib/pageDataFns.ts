/**
 * The server functions the route loaders call. Only `createServerFn` definitions live
 * here (codex's `corpusFns.ts` shape): the Start compiler strips each handler from the
 * client build, and with it the imports of `pageData.ts`, so the wiki bodies, the page
 * index, the chronicle and the transcript bodies never reach the browser. SSR runs the
 * handlers inline; a client navigation fetches them over RPC.
 */
import { createServerFn } from "@tanstack/react-start";

import {
  chronicleEpisodeData,
  chronicleIndexData,
  chronicleShowData,
  homePageData,
  sectionCountsData,
  tagIndexData,
  tagPageData,
  wikiPageData,
} from "./pageData";
import { tracePageData } from "./pageDataTelemetry";

export const getWikiPage = createServerFn({ method: "GET" })
  .validator((path: string) => path)
  .handler(({ data }) => tracePageData("wiki", () => wikiPageData(data)));

export const getHomePage = createServerFn({ method: "GET" }).handler(() =>
  tracePageData("home", homePageData),
);

export const getTagPage = createServerFn({ method: "GET" })
  .validator((tag: string) => tag)
  .handler(({ data }) => tracePageData("tag", () => tagPageData(data)));

export const getTagIndex = createServerFn({ method: "GET" }).handler(() =>
  tracePageData("tag-index", tagIndexData),
);

export const getSectionCounts = createServerFn({ method: "GET" }).handler(() =>
  tracePageData("sections", sectionCountsData),
);

export const getChronicleIndex = createServerFn({ method: "GET" }).handler(() =>
  tracePageData("chronicle", chronicleIndexData),
);

export const getChronicleShow = createServerFn({ method: "GET" })
  .validator((show: string) => show)
  .handler(({ data }) => tracePageData("show", () => chronicleShowData(data)));

export const getChronicleEpisode = createServerFn({ method: "GET" })
  .validator((input: { show: string; episode: string }) => input)
  .handler(({ data }) =>
    tracePageData("episode", () => chronicleEpisodeData(data.show, data.episode)),
  );
