// The stylesheets every SSR frontend loads first (`import "@astra/site-kit/theme"` in the root
// route, just before the app's own globals.css): IBM Plex Mono and gothic's theme. A side-effect
// entry of its own, so the app's import order decides where these rules sit in the cascade.

import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@astra/gothic/theme.css";
