// The type of an app's built SSR handler. Each frontend's server.ts imports
// `./dist/server/server.js`, which `vite build` writes and which doesn't exist on a
// fresh clone or in CI. This pattern declaration lets tsc check server.ts either way.
// site-kit's index.ts references this file, so any program importing site-kit sees it.
declare module "*/dist/server/server.js" {
  const ssr: import("./ssrServer").SsrHandler;
  export default ssr;
}
