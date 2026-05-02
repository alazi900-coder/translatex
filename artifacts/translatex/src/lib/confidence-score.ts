import { ARABIC_REGEX } from "./arabic-processing";

interface ConfidenceInput {
  original: string;
  translation: string;
  maxBytes: number;
  glossaryMatches?: { term: string; translation: string }[];
  hasTMMatch?: boolean;
}

export function calcConfidence(input: ConfidenceInput): number {
  const { original, translation, maxBytes, glossaryMatches = [], hasTMMatch } = input;
  if (!translation?.trim()) return 0;

  let score = 0;

  // 1. Length ratio (max 25)
  const ratio = translation.length / Math.max(original.length, 1);
  if (ratio >= 0.3 && ratio <= 3) {
    score += 25 - Math.abs(1 - ratio) * 10;
  }
  score = Math.max(score, 0);

  // 2. Arabic presence (max 25)
  const arabicChars = (translation.match(new RegExp(ARABIC_REGEX.source, "g")) || []).length;
  const arabicRatio = arabicChars / Math.max(translation.replace(/\s/g, "").length, 1);
  score += Math.min(25, Math.round(arabicRatio * 30));

  // 3. Glossary adherence (max 20)
  if (glossaryMatches.length > 0) {
    let matched = 0;
    for (const g of glossaryMatches) {
      if (translation.includes(g.translation)) matched++;
    }
    score += Math.round((matched / glossaryMatches.length) * 20);
  } else {
    score += 15;
  }

  // 4. Tag preservation (max 15)
  const origTags: string[] = original.match(/[\uFFF9-\uFFFC\uE000-\uF8FF]/g) || [];
  if (origTags.length > 0) {
    const transTags: string[] = translation.match(/[\uFFF9-\uFFFC\uE000-\uF8FF]/g) || [];
    const preserved = origTags.filter((t) => transTags.includes(t)).length;
    score += Math.round((preserved / origTags.length) * 15);
  } else {
    score += 15;
  }

  // 5. Byte limit compliance (max 15)
  if (maxBytes > 0) {
    const byteLen = translation.length * 2; // UTF-16LE approximation
    score += byteLen <= maxBytes ? 15 : Math.max(0, 15 - Math.round(((byteLen - maxBytes) / maxBytes) * 30));
  } else {
    score += 15;
  }

  if (hasTMMatch) score = Math.min(100, score + 5);

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function confidenceColor(score: number): string {
  if (score >= 80) return "text-green-400 bg-green-500/10 border-green-500/20";
  if (score >= 50) return "text-amber-400 bg-amber-500/10 border-amber-500/20";
  return "text-red-400 bg-red-500/10 border-red-500/20";
}

export function confidenceLabel(score: number): string {
  if (score >= 80) return "عالية";
  if (score >= 50) return "متوسطة";
  return "منخفضة";
}
