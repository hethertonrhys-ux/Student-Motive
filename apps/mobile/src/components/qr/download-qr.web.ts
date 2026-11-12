import qrcode from "qrcode-generator";

// On the website: draws the QR code (black on white, with the quiet border
// every camera needs) as a large PNG and downloads it.
export const CAN_DOWNLOAD_QR = true;
export function downloadQr(value: string, fileName: string): boolean {
  try {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    const border = 4;
    const cell = Math.max(8, Math.floor(1200 / (count + border * 2)));
    const size = cell * (count + border * 2);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) return false;
    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, size, size);
    context.fillStyle = "#000000";
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) if (qr.isDark(row, col)) context.fillRect((col + border) * cell, (row + border) * cell, cell, cell);
    }
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = fileName;
    link.setAttribute("data-testid", "qr-download-link");
    document.body.append(link);
    link.click();
    link.remove();
    return true;
  } catch {
    return false;
  }
}
