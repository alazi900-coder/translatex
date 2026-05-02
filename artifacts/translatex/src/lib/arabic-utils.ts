export const PLACEHOLDER_REGEX = /\{[^}]+\}|\[[^\]]+\]|%[sdif0-9]+|<[^>]+>/g;

export function extractTags(text: string): string[] {
  return text.match(PLACEHOLDER_REGEX) ?? [];
}

export function compareTags(source: string, target: string): {
  missing: string[];
  extra: string[];
  ok: boolean;
} {
  const sourceTags = tagCountMap(extractTags(source));
  const targetTags = tagCountMap(extractTags(target));

  const missing: string[] = [];
  const extra: string[] = [];

  for (const [tag, count] of Object.entries(sourceTags)) {
    const targetCount = targetTags[tag] ?? 0;
    if (targetCount < count) {
      for (let i = 0; i < count - targetCount; i++) missing.push(tag);
    }
  }

  for (const [tag, count] of Object.entries(targetTags)) {
    const sourceCount = sourceTags[tag] ?? 0;
    if (count > sourceCount) {
      for (let i = 0; i < count - sourceCount; i++) extra.push(tag);
    }
  }

  return { missing, extra, ok: missing.length === 0 && extra.length === 0 };
}

function tagCountMap(tags: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const tag of tags) {
    map[tag] = (map[tag] ?? 0) + 1;
  }
  return map;
}

export function restoreTags(source: string, brokenTarget: string): string {
  const sourceTags = extractTags(source);
  const targetTags = extractTags(brokenTarget);
  const sourceMap = tagCountMap(sourceTags);
  const targetMap = tagCountMap(targetTags);

  let result = brokenTarget;
  for (const [tag, count] of Object.entries(sourceMap)) {
    const diff = count - (targetMap[tag] ?? 0);
    for (let i = 0; i < diff; i++) {
      result = result + tag;
    }
  }
  return result;
}

export function fixBrackets(text: string): string {
  const stack: string[] = [];
  const result: string[] = [];
  const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
  const closing = new Set([')', ']', '}']);

  for (const ch of text) {
    if (ch in pairs) {
      stack.push(ch);
      result.push(ch);
    } else if (closing.has(ch)) {
      if (stack.length > 0 && pairs[stack[stack.length - 1]] === ch) {
        stack.pop();
        result.push(ch);
      }
    } else {
      result.push(ch);
    }
  }

  while (stack.length > 0) {
    result.push(pairs[stack.pop()!]);
  }

  return result.join('');
}

export function hasDoubledSpaces(text: string): boolean {
  return /  +/.test(text);
}

export function fixDoubledSpaces(text: string): string {
  return text.replace(/  +/g, ' ').trim();
}

export function isPureArabic(text: string): boolean {
  return /^[\u0600-\u06FF\u0750-\u077F\s\d.,!?؟،؛:'"«»()\[\]{}\-_]+$/.test(text.trim());
}

export function hasLatinChars(text: string): boolean {
  return /[a-zA-Z]/.test(text);
}

export function computeSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  const longerLen = longer.length;
  if (longerLen === 0) return 1;
  return (longerLen - editDistance(longer, shorter)) / longerLen;
}

function editDistance(s1: string, s2: string): number {
  const costs: number[] = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}
