import QRCode from "qrcode";
/**
 * Client-side QR render (D31-12) — the `qrcode` npm package draws straight to
 * a data URL in the browser (SVG/canvas under the hood), no external image
 * service. Encodes the lobby snapshot's `joinUrl` (`<public-origin>/?code=…`,
 * server-injected — never hardcoded here).
 */
import { useEffect, useState } from "react";

export interface QRCodeImageProps {
  value: string;
  size?: number;
}

export function QRCodeImage({ value, size = 220 }: QRCodeImageProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDataUrl(null);
    void QRCode.toDataURL(value, {
      margin: 1,
      width: size,
      color: { dark: "#231f1a", light: "#f3e9d2" },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!dataUrl) {
    return (
      <div
        className="qr-placeholder"
        style={{ width: size, height: size }}
        aria-label="Generating QR code…"
      />
    );
  }
  return (
    <img
      src={dataUrl}
      width={size}
      height={size}
      alt={`Scan to join at ${value}`}
      className="qr-code"
    />
  );
}
