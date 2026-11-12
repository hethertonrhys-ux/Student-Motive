// Phones don't download files from the app: the QR code is shown full
// screen instead, ready for a screenshot.
export const CAN_DOWNLOAD_QR = false;
export function downloadQr(_value: string, _fileName: string): boolean {
  return false;
}
