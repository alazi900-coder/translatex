const TAG_PATTERN = /[\uE000-\uF8FF]+|\[\s*\w+\s*:[^\]]*?\s*\]|\[\s*\w+\s*=\s*\w[^\]]*\]|\{\s*\w+\s*:\s*\w[^}]*\}|\{[\w]+\}|\[[A-Z]{1,3}\]|[\uFFF9-\uFFFC]+/g;

function shieldTags(text: string): { shielded: string; tags: string[] } {
  const tags: string[] = [];
  const shielded = text.replace(TAG_PATTERN, (m) => { tags.push(m); return `\uE800${tags.length - 1}\uE801`; });
  return { shielded, tags };
}

function unshieldTags(text: string, tags: string[]): string {
  return text.replace(/\uE800(\d+)\uE801/g, (_match, i) => {
    const idx = parseInt(i, 10);
    return idx >= 0 && idx < tags.length ? tags[idx] : _match;
  });
}

export function fixLonelyLam(text: string): { fixed: string; changes: number } {
  const { shielded, tags } = shieldTags(text);
  let changes = 0;
  let result = shielded;
  let prev = "";
  while (prev !== result) {
    prev = result;
    result = result.replace(/(^|\s)ل(\s|$)/g, (_match, before, after) => { changes++; return `${before}لا${after}`; });
  }
  return { fixed: unshieldTags(result, tags), changes };
}

const TAA_MARBUTA_WORDS = new Set<string>([
  "لعبة", "مرة", "قوة", "مهمة", "منطقة", "قطعة", "شخصية", "قصة", "معركة", "مغامرة",
  "رحلة", "جزيرة", "قرية", "مدينة", "قلعة", "غرفة", "ساحة", "طريقة", "حالة", "نتيجة",
  "مكافأة", "خريطة", "وصفة", "قائمة", "رسالة", "مشكلة", "فكرة", "ذاكرة", "صورة", "نسخة",
  "حركة", "ضربة", "هجمة", "دورة", "جولة", "محطة", "نقطة", "خطوة", "كلمة", "جملة",
  "قدرة", "مهارة", "سرعة", "قفزة", "لحظة", "فترة", "مرحلة", "بداية", "نهاية", "عودة",
  "أداة", "تجربة", "ميزة", "عملية", "حماية", "طاقة", "شجرة", "صخرة", "بحيرة",
  "مساحة", "مسافة", "سلسلة", "حلقة", "وحدة", "مجموعة", "درجة", "مرتبة", "رتبة",
  "عائلة", "ذكرى", "ثروة", "جائزة", "شارة", "علامة", "إشارة", "خزانة", "حقيبة", "زجاجة",
  "بوابة", "نافذة", "شاشة", "واجهة", "لوحة", "ترجمة", "لغة", "كتابة", "قراءة", "محادثة",
  "مملكة", "إمبراطورية", "أميرة", "ملكة", "حكمة", "شجاعة", "أسطورة", "حضارة", "إرادة",
  "بطولة", "ملحمة", "نبوءة", "تعويذة", "لعنة", "حادثة", "كارثة", "مؤامرة", "خيانة",
]);

export function fixTaaMarbutaHaa(text: string): { fixed: string; changes: number } {
  const { shielded, tags } = shieldTags(text);
  let changes = 0;
  const parts = shielded.split(/(\s+|[^\u0600-\u06FF\uE800\uE801\d]+)/);
  const fixed = parts.map((word) => {
    if (word.endsWith("ه") && word.length >= 2) {
      const withTaa = word.slice(0, -1) + "ة";
      if (TAA_MARBUTA_WORDS.has(withTaa)) { changes++; return withTaa; }
    }
    return word;
  });
  return { fixed: unshieldTags(fixed.join(""), tags), changes };
}

export function fixStuckChars(text: string): { fixed: string; changes: number } {
  const original = text;
  let fixed = text;
  // Fix stuck zero-width non-joiner / joiner artifacts
  fixed = fixed.replace(/\u200C\u200D/g, "");
  fixed = fixed.replace(/\u200C{2,}/g, "\u200C");
  fixed = fixed.replace(/\u200D{2,}/g, "\u200D");
  // Fix repeated chars (3+ consecutive same Arabic letter is usually stuck)
  fixed = fixed.replace(/([\u0600-\u06FF])\1{2,}/g, "$1$1");
  const changes = fixed !== original ? 1 : 0;
  return { fixed, changes };
}

export function fixDiacritics(text: string): { fixed: string; changes: number } {
  const original = text;
  // Remove tanwin/shadda that appear at wrong positions or stacked
  let fixed = text.replace(/[\u064B-\u065F]{3,}/g, "");
  // Fix common AI diacritic mistakes: shadda on non-Arabic
  fixed = fixed.replace(/([^ا-ي])\u0651/g, "$1");
  const changes = fixed !== original ? 1 : 0;
  return { fixed, changes };
}

export function fixSpaces(text: string): { fixed: string; changes: number } {
  const original = text;
  let fixed = text;
  // No double spaces
  fixed = fixed.replace(/  +/g, " ");
  // No trailing space before newline
  fixed = fixed.replace(/ \n/g, "\n");
  // No leading space after newline
  fixed = fixed.replace(/\n /g, "\n");
  // No space before Arabic punctuation
  fixed = fixed.replace(/ ([،؛؟])/g, "$1");
  const changes = fixed !== original ? 1 : 0;
  return { fixed, changes };
}

export function fixHamza(text: string): { fixed: string; changes: number } {
  const original = text;
  let fixed = text;
  // Common AI mistakes: أ/إ/ء confusion
  // Word-initial alef + kasra → إ
  fixed = fixed.replace(/\bا([^ا-ي]|$)/g, (_, after) => `إ${after}`);
  // Waw hamza when standalone before space
  fixed = fixed.replace(/\bؤ\b/g, "و");
  const changes = fixed !== original ? 1 : 0;
  return { fixed, changes };
}

export function fixMixedLanguage(
  text: string,
  glossaryArabicTerms: Set<string>
): { fixed: string; changes: number } {
  const original = text;
  // Find Latin words that have Arabic glossary equivalents and replace them
  const fixed = text.replace(/[a-zA-Z]{3,}/g, (match) => {
    const lower = match.toLowerCase();
    for (const term of glossaryArabicTerms) {
      if (term.toLowerCase() === lower) return term;
    }
    return match;
  });
  const changes = fixed !== original ? 1 : 0;
  return { fixed, changes };
}
