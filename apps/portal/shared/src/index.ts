// @astra/portal-shared — the bridge envelope shared by portal-server and the
// Foundry module (spec 0023 D4/D6): parse a raw WS message into `BridgeMessage`
// immediately on receipt, never thread a raw JSON blob through bridge code.
export {
  AuthMsg,
  BridgeErrorCode,
  BridgeMessage,
  McpQuery,
  McpResponse,
  PingMsg,
  PongMsg,
} from "./envelope";
