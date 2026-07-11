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
  McpResponseErrUnknownCode,
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
// The S5 write tools' shared param/result contracts (spec 0023 slice S5, D5/D8/D13).
export {
  CreatedTokenRow,
  CreateJournalParams,
  CreateJournalResult,
  CreateTokenParams,
  CreateTokenResult,
  ImportedDocumentRow,
  ImportFromCompendiumParams,
  ImportFromCompendiumResult,
} from "./tools";
// The S1 authoring tools' shared param/result contracts (spec 0026 D-1..D-14) — 8 new
// write tools superseding 0023 D5 for these tools only.
export {
  ApplyConditionParams,
  ApplyConditionResult,
  ConditionAction,
  CreateActorParams,
  CreateActorResult,
  CreateActorType,
  CreateItemParams,
  CreateItemResult,
  CreateLightParams,
  CreateLightResult,
  CreateMacroParams,
  CreateMacroResult,
  DeleteDocumentParams,
  DeleteDocumentResult,
  ExecuteMacroParams,
  ExecuteMacroResult,
  LightAnimationParams,
  LightConfigParams,
  LightDarknessRange,
  MacroType,
  PersistentDamageParams,
  Pf2eItemType,
  UpdateDocumentParams,
  UpdateDocumentResult,
} from "./tools";
// 0028 S2's player-key query tools — query-party (D28-4) + query-player (D28-2/D28-11/
// D28-13). Module -> server wire stays typed compact JSON; the server (not exported
// here) renders markdown from these (D28-6).
export {
  PartyCompanionRow,
  PartyPcRow,
  PlayerFeatRow,
  PlayerFeatsSection,
  PlayerInventoryRow,
  PlayerInventorySection,
  PlayerNotesSection,
  PlayerSaveRow,
  PlayerSkillRow,
  PlayerSkillsSection,
  PlayerSpellcastingEntryGroup,
  PlayerSpellRankGroup,
  PlayerSpellRow,
  PlayerSpellsSection,
  PlayerStatsSection,
  PlayerSummarySection,
  QueryPartyParams,
  QueryPartyResult,
  QueryPlayerParams,
  QueryPlayerResult,
  QueryPlayerSection,
} from "./tools";
// 0028 S3's player-key query tools — query-item (D28-5/D28-13) + query-rolls
// (D28-3/D28-10/D28-12). Same module-typed-JSON / server-renders-markdown split.
export {
  ItemProvenance,
  QueryItemDetail,
  QueryItemHitRow,
  QueryItemParams,
  QueryItemResult,
  QueryRollsParams,
  QueryRollsResult,
  RollDegreeOutcome,
  RollDieResult,
  RollDieRow,
  RollRow,
} from "./tools";
