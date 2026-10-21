import qrcode from "qrcode-generator";
import { useMemo } from "react";
import { View } from "react-native";

// A QR code drawn with plain views (no image or extra native code): each
// row's runs of dark squares become one block. Always black on white with a
// quiet border, in dark mode too, so any camera can read it.
export function QrCode({ value, size = 240, testID }: { value: string; size?: number; testID?: string }) {
  const { count, runs } = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    const out: { row: number; col: number; len: number }[] = [];
    for (let row = 0; row < n; row++) {
      let col = 0;
      while (col < n) {
        if (!qr.isDark(row, col)) {
          col++;
          continue;
        }
        const start = col;
        while (col < n && qr.isDark(row, col)) col++;
        out.push({ row, col: start, len: col - start });
      }
    }
    return { count: n, runs: out };
  }, [value]);
  const border = 4;
  const cell = size / (count + border * 2);
  return (
    <View style={{ width: size, height: size, backgroundColor: "#FFFFFF", borderRadius: 16 }} accessibilityRole="image" accessibilityLabel="QR code" testID={testID}>
      {runs.map((r, i) => (
        <View key={i} style={{ position: "absolute", left: (r.col + border) * cell, top: (r.row + border) * cell, width: r.len * cell + 0.5, height: cell + 0.5, backgroundColor: "#000000" }} />
      ))}
    </View>
  );
}
