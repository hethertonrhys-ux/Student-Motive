// The website's QR reader (barcode-detector, used by expo-camera) needs a
// decoder file. It's copied into public/ on install, so load it from our
// own address rather than a public CDN.
let ready: Promise<void> | null = null;
export function prepareQrScanner(): Promise<void> {
  ready ??= import("barcode-detector")
    .then(({ prepareZXingModule }) => {
      prepareZXingModule({
        overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? `${window.location.origin}/zxing_reader.wasm` : prefix + path) },
      });
    })
    .catch(() => {
      // Leave the library's own default (the CDN).
    });
  return ready;
}
