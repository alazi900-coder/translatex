import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

const ZELDA_GLOSSARY = `
- Hyrule → هايرول
- Link → لينك
- Zelda → زيلدا
- Ganon / Ganondorf → غانون / غانونداورف
- Sheikah → شيكاه
- Triforce → المثلث المقدس / تراي فورس
- Korok → كوروك
- Zonai → زوناي
- Ultrahand → اليد الخارقة
- Fuse → الدمج
- Ascend → الصعود
- Recall → الاسترجاع
- Shrine → ضريح
- Temple → معبد
- Dungeon → زنزانة / قلعة سرية
- Spirit Orb → كرة الروح
- Calamity → الكارثة
- Malice → الخبث
- Gloom → الكآبة / الظلام
- Sages → الحكماء
- Hylia → هيليا
- Goron → غورون
- Zora → زورا
- Rito → ريتو
- Gerudo → غيرودو
- Kokiri → كوكيري
- Deku → ديكو
- Mogma → موغما
- Lynel → لاينل
- Bokoblin → بوكوبلين
- Moblin → موبلين
- Lizalfos → ليزالفوس
- Hinox → هينوكس
- Talus → تالوس
- Gleeok → غليوك
- Master Sword → سيف الماستر
- Bow of Light → قوس النور
- Paraglider → الشراع
- Sheikah Slate → لوح الشيكاه
- Purah Pad → لوح بوراه
- Heart Container → وعاء القلب
- Stamina Vessel → وعاء القدرة
- Rupee → روبي
- Korok Seed → بذرة كوروك
`;

const BASE_SYSTEM = `أنت مترجم محترف متخصص في ترجمة ألعاب Zelda إلى العربية الفصحى.

قواعد صارمة:
- احتفظ بجميع رموز التحكم كما هي (الحروف في نطاق U+E000–U+E0FF و U+FFF9–U+FFFC)
- لا تترجم أسماء الأماكن والشخصيات إلا وفق المسرد
- استخدم اللغة العربية الفصحى الواضحة
- اجعل الترجمة موجزة ومناسبة لمحدودية مساحة النص في الألعاب
- أعد الترجمة مباشرة بدون مقدمات أو شرح

مسرد مصطلحات Zelda:${ZELDA_GLOSSARY}`;

router.post("/ai/translate", async (req, res) => {
  try {
    const { sourceText, context, glossaryTerms, gameTitle, maxBytes } = req.body as {
      sourceText: string;
      context?: string;
      glossaryTerms?: Array<{ source: string; arabic: string }>;
      gameTitle?: string;
      maxBytes?: number;
    };

    if (!sourceText?.trim()) {
      res.status(400).json({ error: "sourceText مطلوب" });
      return;
    }

    const extraGlossary = glossaryTerms?.length
      ? `\nمسرد إضافي:\n${glossaryTerms.map((t) => `- ${t.source} → ${t.arabic}`).join("\n")}`
      : "";

    const byteLimitNote = maxBytes ? `\nتنبيه: الحد الأقصى للنص ${Math.round(maxBytes / 2)} حرف (${maxBytes} بايت).` : "";
    const contextNote = context ? `\nسياق: ${context}` : "";
    const gameNote = gameTitle ? `\nاللعبة: ${gameTitle}` : "\nاللعبة: Zelda";

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 600,
      messages: [
        { role: "system", content: BASE_SYSTEM + extraGlossary + gameNote },
        {
          role: "user",
          content: `ترجم النص التالي إلى العربية:${contextNote}${byteLimitNote}\n\n"${sourceText}"\n\nأعد فقط الترجمة العربية.`,
        },
      ],
    });

    const arabicText = response.choices[0]?.message?.content?.trim() ?? "";
    res.json({ arabicText, confidence: arabicText ? 0.85 : 0 });
  } catch (err) {
    req.log?.error({ err }, "AI translate error");
    res.status(500).json({ error: "فشل في الترجمة التلقائية" });
  }
});

router.post("/ai/batch-translate", async (req, res) => {
  const { entries, glossaryTerms, gameTitle } = req.body as {
    entries: Array<{ id: string; sourceText: string; context?: string; maxBytes?: number }>;
    glossaryTerms?: Array<{ source: string; arabic: string }>;
    gameTitle?: string;
  };

  if (!Array.isArray(entries) || entries.length === 0) {
    res.status(400).json({ error: "entries مطلوبة" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const extraGlossary = glossaryTerms?.length
    ? `\nمسرد إضافي:\n${glossaryTerms.map((t) => `- ${t.source} → ${t.arabic}`).join("\n")}`
    : "";
  const gameNote = gameTitle ? `\nاللعبة: ${gameTitle}` : "\nاللعبة: Zelda";

  let done = 0;
  const total = entries.length;
  const CONCURRENCY = 4;

  async function processEntry(entry: (typeof entries)[number]) {
    try {
      const contextNote = entry.context ? `\nسياق: ${entry.context}` : "";
      const byteLimitNote = entry.maxBytes ? `\n(الحد: ${Math.round(entry.maxBytes / 2)} حرف)` : "";
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_completion_tokens: 500,
        messages: [
          { role: "system", content: BASE_SYSTEM + extraGlossary + gameNote },
          {
            role: "user",
            content: `ترجم:${contextNote}${byteLimitNote}\n"${entry.sourceText}"\nأعد الترجمة فقط.`,
          },
        ],
      });
      const arabicText = response.choices[0]?.message?.content?.trim() ?? "";
      done++;
      res.write(`data: ${JSON.stringify({ type: "result", data: { id: entry.id, arabicText, confidence: 0.85 } })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: "progress", done, total })}\n\n`);
    } catch (err) {
      done++;
      res.write(`data: ${JSON.stringify({ type: "error", data: { id: entry.id, error: String(err) } })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: "progress", done, total })}\n\n`);
    }
  }

  for (let i = 0; i < entries.length; i += CONCURRENCY) {
    await Promise.all(entries.slice(i, i + CONCURRENCY).map(processEntry));
  }

  res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
  res.end();
});

router.post("/ai/review", async (req, res) => {
  try {
    const { entries } = req.body as {
      entries: Array<{ key: string; original: string; translation: string }>;
    };

    if (!Array.isArray(entries) || entries.length === 0) {
      res.status(400).json({ error: "entries مطلوبة" });
      return;
    }

    const prompt = entries
      .map((e) => `[${e.key}]\nأصل: "${e.original}"\nترجمة: "${e.translation}"`)
      .join("\n\n");

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 2000,
      messages: [
        {
          role: "system",
          content: `${BASE_SYSTEM}\n\nأنت مراجع ترجمة. راجع الترجمات التالية وأعد قائمة JSON بالمشاكل فقط.
الصيغة:
[{"key": "...", "type": "error|warning|info", "message": "وصف المشكلة"}]
إذا لم تجد مشاكل أعد: []`,
        },
        { role: "user", content: prompt },
      ],
    });

    let issues = [];
    try {
      const content = response.choices[0]?.message?.content?.trim() || "[]";
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      issues = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch { issues = []; }

    res.json({ issues });
  } catch (err) {
    req.log?.error({ err }, "AI review error");
    res.status(500).json({ error: "فشل في المراجعة" });
  }
});

router.post("/ai/improve", async (req, res) => {
  try {
    const { entries } = req.body as {
      entries: Array<{ key: string; original: string; translation: string; maxBytes: number }>;
    };

    if (!Array.isArray(entries) || entries.length === 0) {
      res.status(400).json({ error: "entries مطلوبة" });
      return;
    }

    const prompt = entries
      .map((e) => `[${e.key}] حد: ${Math.round(e.maxBytes / 2)} حرف\nأصل: "${e.original}"\nحالي: "${e.translation}"`)
      .join("\n\n");

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 2000,
      messages: [
        {
          role: "system",
          content: `${BASE_SYSTEM}\n\nأنت محسّن ترجمة. اقترح ترجمات أقصر وأفضل مع مراعاة الحد الأقصى للأحرف.
أعد JSON بالصيغة:
[{"key": "...", "improved": "...", "reason": "سبب التحسين"}]`,
        },
        { role: "user", content: prompt },
      ],
    });

    let results = [];
    try {
      const content = response.choices[0]?.message?.content?.trim() || "[]";
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      results = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch { results = []; }

    res.json({ results });
  } catch (err) {
    req.log?.error({ err }, "AI improve error");
    res.status(500).json({ error: "فشل في التحسين" });
  }
});

router.post("/ai/polish", async (req, res) => {
  try {
    const { entries } = req.body as {
      entries: Array<{ key: string; original: string; translation: string }>;
    };

    const prompt = entries
      .map((e) => `[${e.key}]\nأصل: "${e.original}"\nترجمة: "${e.translation}"`)
      .join("\n\n");

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 2000,
      messages: [
        {
          role: "system",
          content: `${BASE_SYSTEM}\n\nأنت مصحح نحوي. صحح الأخطاء النحوية والإملائية فقط دون تغيير المعنى.
أعد JSON: [{"key": "...", "polished": "...", "changes": "ما تم تصحيحه"}]`,
        },
        { role: "user", content: prompt },
      ],
    });

    let results = [];
    try {
      const content = response.choices[0]?.message?.content?.trim() || "[]";
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      results = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch { results = []; }

    res.json({ results });
  } catch (err) {
    req.log?.error({ err }, "AI polish error");
    res.status(500).json({ error: "فشل في الصقل" });
  }
});

router.post("/ai/enhance", async (req, res) => {
  try {
    const { key, original, translation, context } = req.body as {
      key: string;
      original: string;
      translation: string;
      context?: string;
    };

    const contextNote = context ? `\nسياق محيط:\n${context}` : "";

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 800,
      messages: [
        { role: "system", content: BASE_SYSTEM },
        {
          role: "user",
          content: `حسّن هذه الترجمة مراعياً السياق:${contextNote}\n\nأصل: "${original}"\nحالي: "${translation}"\n\nأعد الترجمة المحسّنة فقط.`,
        },
      ],
    });

    const enhanced = response.choices[0]?.message?.content?.trim() ?? translation;
    res.json({ key, enhanced });
  } catch (err) {
    req.log?.error({ err }, "AI enhance error");
    res.status(500).json({ error: "فشل في التحسين" });
  }
});

router.post("/ai/alternatives", async (req, res) => {
  try {
    const { key, original, translation } = req.body as {
      key: string;
      original: string;
      translation: string;
    };

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 800,
      messages: [
        { role: "system", content: BASE_SYSTEM },
        {
          role: "user",
          content: `اقترح 3 بدائل بأساليب مختلفة لهذه الترجمة:
أصل: "${original}"
حالي: "${translation}"

أعد JSON:
[{"style": "رسمي|عامي|شعري", "text": "...", "reason": "..."}]`,
        },
      ],
    });

    let alternatives = [];
    try {
      const content = response.choices[0]?.message?.content?.trim() || "[]";
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      alternatives = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch { alternatives = []; }

    res.json({ key, alternatives });
  } catch (err) {
    req.log?.error({ err }, "AI alternatives error");
    res.status(500).json({ error: "فشل في اقتراح البدائل" });
  }
});

router.post("/ai/smart-review", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const { entries } = req.body as {
      entries: Array<{ key: string; original: string; translation: string; maxBytes?: number }>;
    };

    if (!Array.isArray(entries) || entries.length === 0) {
      res.write(`data: ${JSON.stringify({ type: "error", message: "entries مطلوبة" })}\n\n`);
      res.end();
      return;
    }

    const BATCH_SIZE = 10;
    const findings: Array<{ key: string; original: string; current: string; fix: string; issue: string; type: string; score: number }> = [];

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);
      const prompt = batch
        .map((e) => `[${e.key}] (حد: ${Math.round((e.maxBytes || 999) / 2)} حرف)\nأصل: "${e.original}"\nترجمة: "${e.translation}"`)
        .join("\n\n");

      try {
        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          max_completion_tokens: 2000,
          messages: [
            {
              role: "system",
              content: `${BASE_SYSTEM}\n\nراجع الترجمات وأعد JSON للمشاكل فقط:
[{"key":"...","issue":"وصف المشكلة","fix":"الترجمة المصححة","type":"error|warning","score":0-100}]
إذا لم تجد مشاكل أعد: []`,
            },
            { role: "user", content: prompt },
          ],
        });

        const content = response.choices[0]?.message?.content?.trim() || "[]";
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        const batchFindings = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
        for (const f of batchFindings) {
          const entry = batch.find((e) => e.key === f.key);
          if (entry) findings.push({ ...f, original: entry.original, current: entry.translation });
        }
      } catch { /* continue */ }

      res.write(`data: ${JSON.stringify({ type: "progress", done: Math.min(i + BATCH_SIZE, entries.length), total: entries.length, findings })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ type: "done", findings })}\n\n`);
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: "error", message: String(err) })}\n\n`);
  }
  res.end();
});

export default router;
