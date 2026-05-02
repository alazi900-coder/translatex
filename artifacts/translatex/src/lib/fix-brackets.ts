export function fixBrackets(original: string, translation: string): string {
  const origTags = original.match(/\[[^\]]*\]/g) || [];
  let depth = 0;
  for (const ch of translation) {
    if (ch === "[") depth++;
    else if (ch === "]") depth--;
  }
  let fixed = translation;
  if (depth > 0) fixed = fixed + "]".repeat(depth);
  else if (depth < 0) fixed = "[".repeat(-depth) + fixed;
  for (const tag of origTags) {
    if (!fixed.includes(tag)) fixed = fixed.trimEnd() + " " + tag;
  }
  fixed = fixed.replace(/ {2,}/g, " ");
  return fixed;
}
