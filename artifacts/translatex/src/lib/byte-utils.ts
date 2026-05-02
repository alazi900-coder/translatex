export function utf16leByteLength(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      i++;
    } else {
      bytes += 2;
    }
  }
  return bytes;
}

export function byteStatus(current: number, max: number): "ok" | "warn" | "error" {
  if (current > max) return "error";
  if (current > max * 0.9) return "warn";
  return "ok";
}

export function formatBytes(bytes: number): string {
  return `${bytes} بايت`;
}

export function bytePercentage(current: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(100, Math.round((current / max) * 100));
}
