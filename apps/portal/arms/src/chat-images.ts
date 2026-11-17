// Chat cards put a token's image in an <img>, which cannot show a video: an animated token (a
// JB2A rune .webm) shows as a broken image. This swaps such an image for a still: JB2A's own
// thumbnail beside the video when the name follows its pattern, otherwise a muted looping video.

/** JB2A ships `<name>_Thumb.webp` beside `<name>_<w>x<h>.webm`. */
export function stillFor(src: string): string | null {
  const match = /^(.*)_\d+x\d+\.webm(\?.*)?$/i.exec(src);
  return match ? `${match[1]}_Thumb.webp` : null;
}

function isVideo(src: string): boolean {
  return /\.(webm|mp4|m4v|ogv)(\?.*)?$/i.test(src);
}

/** Replace every video-backed <img> under `root`. */
function fixChatImages(root: HTMLElement): void {
  for (const img of root.querySelectorAll<HTMLImageElement>("img")) {
    const src = img.getAttribute("src") ?? "";
    if (!isVideo(src)) continue;
    const still = stillFor(src);
    if (still) {
      img.setAttribute("src", still);
      continue;
    }
    const video = document.createElement("video");
    video.src = src;
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.className = img.className;
    video.style.cssText = img.style.cssText;
    video.width = img.width;
    video.height = img.height;
    img.replaceWith(video);
  }
}

/** Register the chat hook on this client; returns a teardown. */
export function createChatImages(): () => void {
  const fix = (_message: unknown, html: HTMLElement | { 0?: HTMLElement }): void => {
    const root = html instanceof HTMLElement ? html : html[0];
    if (root) fixChatImages(root);
  };
  const id = Hooks.on("renderChatMessageHTML", fix);
  return () => Hooks.off("renderChatMessageHTML", id);
}
