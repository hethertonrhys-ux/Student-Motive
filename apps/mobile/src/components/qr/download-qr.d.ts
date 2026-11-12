// Saving a QR code as a picture (for posters and slides). Metro picks
// download-qr.web.ts (a PNG the browser downloads) or download-qr.native.ts
// (phones can't: they show the code full screen to screenshot instead).
export declare const CAN_DOWNLOAD_QR: boolean;
export declare function downloadQr(value: string, fileName: string): boolean;
