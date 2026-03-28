import * as ImageManipulator from 'expo-image-manipulator';

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Maps the square viewport (side V) to image pixel space and exports a square JPEG (400×400 max).
 * Transform must match `ProfileAvatarCropModal` (cover scale + uniform pinch + pan from center).
 */
export async function exportAvatarSquareJpeg(
  uri: string,
  iw: number,
  ih: number,
  V: number,
  userScale: number,
  translateX: number,
  translateY: number
): Promise<string> {
  const coverScale = Math.max(V / iw, V / ih);
  const baseW = iw * coverScale;
  const baseH = ih * coverScale;
  const w = baseW * userScale;
  const h = baseH * userScale;
  const left = V / 2 + translateX - w / 2;
  const top = V / 2 + translateY - h / 2;

  const x0 = ((0 - left) / w) * iw;
  const x1 = ((V - left) / w) * iw;
  const y0 = ((0 - top) / h) * ih;
  const y1 = ((V - top) / h) * ih;

  const midX = (x0 + x1) / 2;
  const midY = (y0 + y1) / 2;
  let side = Math.min(Math.abs(x1 - x0), Math.abs(y1 - y0));
  side = Math.floor(side);
  if (!Number.isFinite(side) || side < 2) {
    throw new Error('Could not compute crop — try zooming or repositioning.');
  }

  let ox = Math.round(midX - side / 2);
  let oy = Math.round(midY - side / 2);
  ox = clamp(ox, 0, Math.max(0, iw - side));
  oy = clamp(oy, 0, Math.max(0, ih - side));
  const finalSide = Math.min(side, iw - ox, ih - oy);
  if (finalSide < 2) {
    throw new Error('Crop region is too small.');
  }

  const result = await ImageManipulator.manipulateAsync(
    uri,
    [
      { crop: { originX: ox, originY: oy, width: finalSide, height: finalSide } },
      { resize: { width: 400, height: 400 } },
    ],
    { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
  );
  return result.uri;
}
