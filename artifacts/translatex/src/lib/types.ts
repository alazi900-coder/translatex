import React from "react";

export interface ExtractedEntry {
  msbtFile: string;
  index: number;
  label: string;
  original: string;
  maxBytes: number;
}

export interface EditorState {
  entries: ExtractedEntry[];
  translations: Record<string, string>;
  protectedEntries?: Set<string>;
  glossary?: string;
  technicalBypass?: Set<string>;
  langFileName?: string;
  dictFileName?: string;
}

export interface ReviewIssue {
  key: string;
  type: "error" | "warning" | "info";
  message: string;
  original?: string;
  translation?: string;
}

export interface ReviewSummary {
  total: number;
  errors: number;
  warnings: number;
  checked: number;
}

export interface ReviewResults {
  issues: ReviewIssue[];
  summary: ReviewSummary;
}

export interface ShortSuggestion {
  key: string;
  original: string;
  current: string;
  suggested: string;
  currentBytes: number;
  suggestedBytes: number;
  maxBytes: number;
}

export interface ImproveResult {
  key: string;
  original: string;
  current: string;
  improved: string;
  reason: string;
  improvedBytes: number;
  maxBytes: number;
}

export interface FileCategory {
  id: string;
  label: string;
  emoji: string;
}

export const AUTOSAVE_DELAY = 1500;
export const AI_BATCH_SIZE = 30;
export const PAGE_SIZE = 50;
export const INPUT_DEBOUNCE = 300;

export const TAG_TYPES: Record<string, { label: string; color: string; tooltip: string }> = {
  "\uFFF9": { label: "⚙", color: "bg-blue-500/20 text-blue-400 border-blue-500/30", tooltip: "رمز تحكم (إيقاف مؤقت، انتظار، سرعة نص)" },
  "\uFFFA": { label: "🎨", color: "bg-purple-500/20 text-purple-400 border-purple-500/30", tooltip: "رمز تنسيق (لون، حجم خط، روبي)" },
  "\uFFFB": { label: "📌", color: "bg-amber-500/20 text-amber-400 border-amber-500/30", tooltip: "متغير (اسم اللاعب، عدد، اسم عنصر)" },
};
export const TAG_FALLBACK = { label: "…", color: "bg-muted text-muted-foreground", tooltip: "رمز تقني خاص بمحرك اللعبة" };

export const FILE_CATEGORIES: FileCategory[] = [
  { id: "main-menu", label: "القائمة الرئيسية", emoji: "🏠" },
  { id: "settings", label: "الإعدادات", emoji: "⚙️" },
  { id: "hud", label: "واجهة اللعب", emoji: "🖥️" },
  { id: "pause-menu", label: "قائمة الإيقاف", emoji: "⏸️" },
  { id: "swords", label: "السيوف", emoji: "⚔️" },
  { id: "spears", label: "الرماح", emoji: "🔱" },
  { id: "bows", label: "الأقواس", emoji: "🏹" },
  { id: "shields", label: "الدروع/التروس", emoji: "🛡️" },
  { id: "armor", label: "الملابس", emoji: "👕" },
  { id: "food", label: "الطعام والطبخ", emoji: "🍖" },
  { id: "insects", label: "الحشرات والمخلوقات", emoji: "🦗" },
  { id: "enemy-parts", label: "أجزاء الوحوش", emoji: "🦴" },
  { id: "ores", label: "المعادن والأحجار", emoji: "💎" },
  { id: "materials", label: "المواد والموارد", emoji: "🧪" },
  { id: "zonai", label: "أدوات زوناي", emoji: "🔧" },
  { id: "special-tools", label: "أسهم وأدوات خاصة", emoji: "🏹" },
  { id: "fuse", label: "مواد الدمج (Fuse)", emoji: "🔗" },
  { id: "monsters", label: "الوحوش والأعداء", emoji: "👹" },
  { id: "npc", label: "الشخصيات (NPC)", emoji: "🎭" },
  { id: "story", label: "حوارات القصة", emoji: "📖" },
  { id: "challenge", label: "المهام والتحديات", emoji: "📜" },
  { id: "map", label: "المواقع والخرائط", emoji: "🗺️" },
  { id: "tips", label: "النصائح والتعليمات", emoji: "💡" },
];

export function hasTechnicalTags(text: string): boolean {
  return /[\uFFF9\uFFFA\uFFFB\uFFFC\uE000-\uE0FF]/.test(text);
}

export function restoreTagsLocally(original: string, translation: string): string {
  const TAG_REGEX = /[\uFFF9-\uFFFC\uE000-\uE0FF]/g;
  const TAG_TEST = /[\uFFF9-\uFFFC\uE000-\uE0FF]/;
  const origMarkers = original.match(TAG_REGEX) || [];
  if (origMarkers.length === 0) return translation;
  const transMarkers = translation.match(TAG_REGEX) || [];
  if (transMarkers.length >= origMarkers.length) return translation;
  const transMarkerSet = new Set(transMarkers);
  const someMissing = origMarkers.some((m) => !transMarkerSet.has(m));
  if (!someMissing) return translation;
  const origGroups: { chars: string; relPos: number }[] = [];
  let i = 0;
  while (i < original.length) {
    if (TAG_TEST.test(original[i])) {
      const start = i;
      let group = "";
      while (i < original.length && TAG_TEST.test(original[i])) { group += original[i]; i++; }
      origGroups.push({ chars: group, relPos: ((start + i) / 2) / Math.max(original.length, 1) });
    } else { i++; }
  }
  const groupsToInsert: { chars: string; relPos: number }[] = [];
  for (const group of origGroups) {
    const anyMissing = [...group.chars].some((c) => !transMarkerSet.has(c));
    if (anyMissing) { groupsToInsert.push(group); for (const c of group.chars) transMarkerSet.delete(c); }
  }
  if (groupsToInsert.length === 0) return translation;
  const charsToStrip = new Set(groupsToInsert.flatMap((g) => [...g.chars]));
  let clean = "";
  for (let j = 0; j < translation.length; j++) { if (!charsToStrip.has(translation[j])) clean += translation[j]; }
  const plainText = clean.replace(TAG_REGEX, "");
  const wordBoundaries = [0];
  for (let j = 0; j < plainText.length; j++) { if (plainText[j] === " " || plainText[j] === "\n") wordBoundaries.push(j + 1); }
  wordBoundaries.push(plainText.length);
  const insertions: { pos: number; chars: string }[] = [];
  for (const group of groupsToInsert) {
    const rawPos = Math.round(group.relPos * plainText.length);
    let bestPos = rawPos, bestDist = Infinity;
    for (const wb of wordBoundaries) { const d = Math.abs(wb - rawPos); if (d < bestDist) { bestDist = d; bestPos = wb; } }
    insertions.push({ pos: bestPos, chars: group.chars });
  }
  insertions.sort((a, b) => b.pos - a.pos);
  const plainToClean: number[] = [];
  let pi2 = 0;
  for (let ci = 0; ci <= clean.length; ci++) {
    if (ci === clean.length || !TAG_TEST.test(clean[ci])) { plainToClean.push(ci); pi2++; }
  }
  let result = clean;
  for (const ins of insertions) {
    const cleanPos = ins.pos < plainToClean.length ? plainToClean[ins.pos] : result.length;
    const pos = Math.min(cleanPos, result.length);
    result = result.slice(0, pos) + ins.chars + result.slice(pos);
    for (let k = 0; k < plainToClean.length; k++) { if (plainToClean[k] >= pos) plainToClean[k] += ins.chars.length; }
  }
  return result;
}

export function displayOriginal(text: string): React.ReactNode {
  const regex = /([\uFFF9\uFFFA\uFFFB\uFFFC\uE000-\uE0FF\u0000-\u0008\u000E-\u001F]+)/g;
  const parts = text.split(regex);
  const elements: React.ReactNode[] = [];
  let keyIdx = 0;
  for (const part of parts) {
    if (!part) continue;
    const firstCode = part.charCodeAt(0);
    if (firstCode >= 0xE000 && firstCode <= 0xE0FF) {
      for (let ci = 0; ci < part.length; ci++) {
        const code = part.charCodeAt(ci);
        if (code >= 0xE000 && code <= 0xE0FF) {
          const tagNum = code - 0xE000 + 1;
          elements.push(
            React.createElement("span", {
              key: keyIdx++,
              className: "inline-block px-1 rounded border text-xs mx-0.5 bg-blue-500/20 text-blue-400 border-blue-500/30 cursor-help",
              title: `رمز تحكم #${tagNum} — لا تحذفه`,
            }, `🏷${tagNum}`)
          );
        }
      }
      continue;
    }
    const tagType = TAG_TYPES[part[0]] || (part.match(/[\uFFF9\uFFFA\uFFFB\uFFFC\u0000-\u0008\u000E-\u001F]/) ? TAG_FALLBACK : null);
    if (tagType) {
      elements.push(React.createElement("span", { key: keyIdx++, className: `inline-block px-1 rounded border text-xs mx-0.5 ${tagType.color} cursor-help`, title: tagType.tooltip }, tagType.label));
      continue;
    }
    elements.push(React.createElement(React.Fragment, { key: keyIdx++ }, part));
  }
  return elements;
}

export function categorizeFile(filePath: string, label?: string): string {
  if (label) {
    if (/^Weapon_(Sword|Lsword|SmallSword)_/i.test(label)) return "swords";
    if (/^Weapon_Spear_/i.test(label)) return "spears";
    if (/^Weapon_Bow_/i.test(label)) return "bows";
    if (/^Weapon_Shield_/i.test(label)) return "shields";
    if (/^(Obj_SubstituteCloth_|Armor_)/i.test(label)) return "armor";
    if (/^Item_(Cook|Fruit|Mushroom|Fish|Meat|PlantGet|Vegetable|Boiled)_/i.test(label)) return "food";
    if (/^Animal_Insect_/i.test(label)) return "insects";
    if (/^Item_Enemy_/i.test(label)) return "enemy-parts";
    if (/^Item_Ore_/i.test(label)) return "ores";
    if (/^(Item_Material_|Item_LumberjackTree_)/i.test(label)) return "materials";
    if (/^SpObj_/i.test(label)) return "zonai";
    if (/^(NormalArrow_|Obj_UltraHand|PutRupee_|Obj_TreasureMap_)/i.test(label)) return "special-tools";
    if (/^Enemy_/i.test(label)) return "monsters";
  }
  if (/LayoutMsg\/(Title|Boot|Save|Load|GameOver|Opening|Ending)/i.test(filePath)) return "main-menu";
  if (/LayoutMsg\/(Option|Config|Setting|System|Language|Control|Camera|Sound)/i.test(filePath)) return "settings";
  if (/LayoutMsg\/(Pause|Menu|Pouch|Inventory|Equipment|Status)/i.test(filePath)) return "pause-menu";
  if (/LayoutMsg\//i.test(filePath)) return "hud";
  if (/PictureBook|Boss/i.test(filePath)) return "monsters";
  if (/Npc\.msbt/i.test(filePath)) return "npc";
  if (/Attachment\.msbt/i.test(filePath)) return "fuse";
  if (/EventFlowMsg\//i.test(filePath)) return "story";
  if (/ChallengeMsg\//i.test(filePath)) return "challenge";
  if (/LocationMsg\//i.test(filePath)) return "map";
  if (/StaticMsg\//i.test(filePath)) return "tips";
  return "other";
}

export function isTechnicalText(text: string): boolean {
  if (/^[0-9A-Fa-f\-\._:\/]+$/.test(text.trim())) return true;
  if (/\[[^\]]*\]/.test(text) && text.length < 50) return true;
  if (/<[^>]+>/.test(text)) return true;
  if (/[\\/][\w\-]+[\\/]/i.test(text)) return true;
  if (text.length < 10 && /[{}()\[\]<>|&%$#@!]/.test(text)) return true;
  if (/^[a-z]+([A-Z][a-z]*)+$|^[a-z]+(_[a-z]+)+$/.test(text.trim())) return true;
  return false;
}

export function entryKey(entry: ExtractedEntry): string {
  return `${entry.msbtFile}:${entry.index}`;
}

export function hasArabicChars(text: string): boolean {
  return /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}
