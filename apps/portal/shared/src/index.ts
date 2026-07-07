// @astra/portal-shared — the bridge envelope shared by portal-server and the
// Foundry module (spec 0023 D4/D6): parse a raw WS message into `BridgeMessage`
// immediately on receipt, never thread a raw JSON blob through bridge code.
export {
  AuthMeta,
  AuthMsg,
  BridgeErrorCode,
  BridgeMessage,
  McpQuery,
  McpResponse,
  PingMsg,
  PongMsg,
} from "./envelope";
// The S4 read tools' shared param/result contracts (spec 0023 slice S4) — see
// `tools.ts` for why these stay compact/LLM-friendly rather than modeling pf2e.
export {
  CompendiumIndexRow,
  CompendiumPackRow,
  CurrentSceneInfo,
  GetCurrentSceneParams,
  GetCurrentSceneResult,
  GetDocumentParams,
  GetDocumentResult,
  ListCompendiumPacksParams,
  ListCompendiumPacksResult,
  ListScenesParams,
  ListScenesResult,
  SceneRow,
  SearchCompendiumParams,
  SearchCompendiumResult,
  SearchWorldParams,
  SearchWorldResult,
  WorldSearchRow,
  WorldSearchType,
} from "./tools";
