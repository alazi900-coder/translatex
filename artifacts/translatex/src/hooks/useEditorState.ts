import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { idbSet, idbGet, idbSetSync } from "@/lib/idb-storage";
import { hasArabicChars, hasArabicPresentationForms, removeArabicPresentationForms, ARABIC_REGEX, reverseBidi } from "@/lib/arabic-processing";
import { utf16leByteLength } from "@/lib/byte-utils";
import { calcConfidence } from "@/lib/confidence-score";
import {
  ExtractedEntry, EditorState, AUTOSAVE_DELAY, AI_BATCH_SIZE, PAGE_SIZE,
  categorizeFile, isTechnicalText, hasTechnicalTags, restoreTagsLocally, entryKey,
} from "@/lib/types";
import { fixLonelyLam, fixTaaMarbutaHaa, fixStuckChars, fixDiacritics, fixSpaces, fixHamza } from "@/lib/arabic-text-fixes";
import { fixBrackets } from "@/lib/fix-brackets";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
const API_BASE = (BASE_URL === "" || BASE_URL === "/") ? "/api" : BASE_URL.replace(/\/[^/]*$/, "") + "/api";

export type TranslationEngine = "lovable" | "gemini" | "claude" | "mymemory" | "google";

export interface QualityStats {
  total: number;
  translated: number;
  empty: number;
  tooShort: number;
  tooLong: number;
  stuckChars: number;
  mixedLang: number;
  missingTags: number;
  confidence: { high: number; medium: number; low: number };
}

export function useEditorState() {
  const [state, setState] = useState<EditorState | null>(null);
  const [search, setSearch] = useState("");
  const [filterFile, setFilterFile] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState<Set<string>>(new Set());
  const [filterTechnical, setFilterTechnical] = useState<"all" | "only" | "exclude">("all");
  const [translateProgress, setTranslateProgress] = useState("");
  const [lastSaved, setLastSaved] = useState("");
  const [currentPage, setCurrentPage] = useState(0);
  const [translationEngine, _setTranslationEngine] = useState<TranslationEngine>(() => {
    try { return (localStorage.getItem("txEngine") as TranslationEngine) || "lovable"; } catch { return "lovable"; }
  });
  const [userGeminiKey, _setUserGeminiKey] = useState(() => {
    try { return localStorage.getItem("txGeminiKey") || ""; } catch { return ""; }
  });
  const [userClaudeKey, _setUserClaudeKey] = useState(() => {
    try { return localStorage.getItem("txClaudeKey") || ""; } catch { return ""; }
  });
  const [myMemoryEmail, _setMyMemoryEmail] = useState(() => {
    try { return localStorage.getItem("txMyMemoryEmail") || ""; } catch { return ""; }
  });
  const [geminiModel, _setGeminiModel] = useState<"gemini-2.0-flash" | "gemini-2.5-flash" | "gemini-2.5-pro">(() => {
    try { return (localStorage.getItem("txGeminiModel") as "gemini-2.0-flash" | "gemini-2.5-flash" | "gemini-2.5-pro") || "gemini-2.5-flash"; } catch { return "gemini-2.5-flash"; }
  });
  const [translating, setTranslating] = useState(false);
  const [glossaryText, setGlossaryText] = useState(() => {
    try { return localStorage.getItem("txGlossary") || ""; } catch { return ""; }
  });
  const [showReview, setShowReview] = useState(false);
  const [reviewFindings, setReviewFindings] = useState<Array<{ key: string; original: string; current: string; fix: string; issue: string; type: string; score: number }>>([]);
  const [reviewing, setReviewing] = useState(false);
  const [quickAlternatives, setQuickAlternatives] = useState<null | { key: string; alternatives: Array<{ style: string; text: string; reason: string }> }>(null);
  const [fixPreview, setFixPreview] = useState<null | { title: string; items: Array<{ key: string; before: string; after: string }>; updates: Record<string, string> }>(null);

  const stopRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const stateRef = useRef<EditorState | null>(null);

  useEffect(() => { stateRef.current = state; }, [state]);

  const setTranslationEngine = useCallback((e: TranslationEngine) => {
    _setTranslationEngine(e);
    try { localStorage.setItem("txEngine", e); } catch { /**/ }
  }, []);
  const setUserGeminiKey = useCallback((k: string) => {
    _setUserGeminiKey(k);
    try { if (k) localStorage.setItem("txGeminiKey", k); else localStorage.removeItem("txGeminiKey"); } catch { /**/ }
  }, []);
  const setUserClaudeKey = useCallback((k: string) => {
    _setUserClaudeKey(k);
    try { if (k) localStorage.setItem("txClaudeKey", k); else localStorage.removeItem("txClaudeKey"); } catch { /**/ }
  }, []);
  const setMyMemoryEmail = useCallback((e: string) => {
    _setMyMemoryEmail(e);
    try { if (e) localStorage.setItem("txMyMemoryEmail", e); else localStorage.removeItem("txMyMemoryEmail"); } catch { /**/ }
  }, []);
  const setGeminiModel = useCallback((m: "gemini-2.0-flash" | "gemini-2.5-flash" | "gemini-2.5-pro") => {
    _setGeminiModel(m);
    try { localStorage.setItem("txGeminiModel", m); } catch { /**/ }
  }, []);

  const saveGlossary = useCallback((text: string) => {
    setGlossaryText(text);
    try { localStorage.setItem("txGlossary", text); } catch { /**/ }
  }, []);

  // Parse glossary map
  const glossaryMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const line of glossaryText.split("\n")) {
      const parts = line.split(/→|->|=/);
      if (parts.length >= 2) {
        const src = parts[0].trim();
        const tgt = parts.slice(1).join("→").trim();
        if (src && tgt) map.set(src.toLowerCase(), tgt);
      }
    }
    return map;
  }, [glossaryText]);

  // Load from IDB on mount
  useEffect(() => {
    const load = async () => {
      try {
        const stored = await idbGet<EditorState & { protectedEntries?: string[]; technicalBypass?: string[] }>("editorState");
        if (stored?.entries?.length) {
          const validKeys = new Set(stored.entries.map((e) => entryKey(e)));
          const filteredTrans: Record<string, string> = {};
          for (const [k, v] of Object.entries(stored.translations || {})) {
            if (validKeys.has(k)) filteredTrans[k] = v;
          }
          // Auto-detect pre-translated Arabic entries
          for (const entry of stored.entries) {
            const k = entryKey(entry);
            if (!filteredTrans[k] && ARABIC_REGEX.test(entry.original)) {
              filteredTrans[k] = entry.original;
            }
          }
          const protectedSet = new Set<string>(Array.isArray(stored.protectedEntries) ? stored.protectedEntries : []);
          const bypassSet = new Set<string>(Array.isArray(stored.technicalBypass) ? stored.technicalBypass : []);
          // Auto-repair missing tags
          for (const entry of stored.entries) {
            if (!hasTechnicalTags(entry.original)) continue;
            const k = entryKey(entry);
            const trans = filteredTrans[k] || "";
            if (!trans.trim()) continue;
            const origTags = entry.original.match(/[\uFFF9-\uFFFC\uE000-\uF8FF]/g) || [];
            const transTags = trans.match(/[\uFFF9-\uFFFC\uE000-\uF8FF]/g) || [];
            if (transTags.length < origTags.length) {
              const fixed = restoreTagsLocally(entry.original, trans);
              if (fixed !== trans) filteredTrans[k] = fixed;
            }
          }
          setState({
            entries: stored.entries,
            translations: filteredTrans,
            protectedEntries: protectedSet,
            technicalBypass: bypassSet,
            langFileName: stored.langFileName,
            dictFileName: stored.dictFileName,
          });
          setLastSaved("تم تحميل الجلسة السابقة");
        }
      } catch (err) {
        console.warn("Failed to load editor state:", err);
      }
    };
    load();
  }, []);

  const saveToIDB = useCallback(async (s: EditorState) => {
    await idbSet("editorState", {
      entries: s.entries,
      translations: s.translations,
      protectedEntries: Array.from(s.protectedEntries || []),
      technicalBypass: Array.from(s.technicalBypass || []),
      langFileName: s.langFileName,
      dictFileName: s.dictFileName,
    });
    setLastSaved(`آخر حفظ: ${new Date().toLocaleTimeString("ar-SA")}`);
  }, []);

  useEffect(() => {
    if (!state) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveToIDB(state), AUTOSAVE_DELAY);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [state?.translations, saveToIDB]);

  useEffect(() => {
    const flush = () => {
      if (saveTimerRef.current && stateRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = undefined;
        idbSetSync("editorState", {
          entries: stateRef.current.entries,
          translations: stateRef.current.translations,
          protectedEntries: Array.from(stateRef.current.protectedEntries || []),
          technicalBypass: Array.from(stateRef.current.technicalBypass || []),
        });
      }
    };
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
    return () => window.removeEventListener("beforeunload", flush);
  }, []);

  // Derived data
  const msbtFiles = useMemo(() => {
    if (!state) return [];
    return [...new Set(state.entries.map((e) => e.msbtFile))].sort();
  }, [state?.entries]);

  const toggleFilterStatus = useCallback((s: string) => {
    setFilterStatus((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }, []);

  const filteredEntries = useMemo(() => {
    if (!state) return [];
    return state.entries.filter((entry) => {
      const key = entryKey(entry);
      const trans = state.translations[key] || "";
      const isTech = isTechnicalText(entry.original);

      if (filterFile !== "all" && entry.msbtFile !== filterFile) return false;
      if (filterCategory !== "all") {
        const cat = categorizeFile(entry.msbtFile, entry.label);
        if (cat !== filterCategory) return false;
      }
      if (filterTechnical === "only" && !isTech) return false;
      if (filterTechnical === "exclude" && isTech) return false;

      if (filterStatus.size > 0) {
        const isEmpty = !trans.trim();
        const isProtected = (state.protectedEntries || new Set()).has(key);
        const statusOk = (filterStatus.has("empty") && isEmpty)
          || (filterStatus.has("translated") && !isEmpty)
          || (filterStatus.has("protected") && isProtected)
          || (filterStatus.has("tags") && hasTechnicalTags(entry.original));
        if (!statusOk) return false;
      }

      if (search.trim()) {
        const q = search.toLowerCase();
        if (!entry.original.toLowerCase().includes(q) &&
          !trans.toLowerCase().includes(q) &&
          !entry.label.toLowerCase().includes(q) &&
          !entry.msbtFile.toLowerCase().includes(q)) return false;
      }

      return true;
    });
  }, [state, filterFile, filterCategory, filterStatus, filterTechnical, search]);

  const totalPages = Math.ceil(filteredEntries.length / PAGE_SIZE);
  const pageEntries = useMemo(
    () => filteredEntries.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE),
    [filteredEntries, currentPage]
  );

  const qualityStats = useMemo((): QualityStats => {
    if (!state) return { total: 0, translated: 0, empty: 0, tooShort: 0, tooLong: 0, stuckChars: 0, mixedLang: 0, missingTags: 0, confidence: { high: 0, medium: 0, low: 0 } };
    let translated = 0, empty = 0, tooShort = 0, tooLong = 0, stuckChars = 0, mixedLang = 0, missingTags = 0;
    let confHigh = 0, confMed = 0, confLow = 0;
    for (const e of state.entries) {
      const k = entryKey(e);
      const t = state.translations[k] || "";
      if (!t.trim()) { empty++; continue; }
      translated++;
      const byteLen = utf16leByteLength(t);
      if (byteLen < 2) tooShort++;
      if (byteLen > e.maxBytes) tooLong++;
      if (/[\u0600-\u06FF]/.test(e.original) && /[a-zA-Z]{3,}/.test(t)) mixedLang++;
      if (hasTechnicalTags(e.original)) {
        const origTags = e.original.match(/[\uFFF9-\uFFFC\uE000-\uF8FF]/g) || [];
        const transTags = t.match(/[\uFFF9-\uFFFC\uE000-\uF8FF]/g) || [];
        if (transTags.length < origTags.length) missingTags++;
      }
      const conf = calcConfidence({ original: e.original, translation: t, maxBytes: e.maxBytes });
      if (conf >= 80) confHigh++;
      else if (conf >= 50) confMed++;
      else confLow++;
    }
    return { total: state.entries.length, translated, empty, tooShort, tooLong, stuckChars, mixedLang, missingTags, confidence: { high: confHigh, medium: confMed, low: confLow } };
  }, [state?.translations]);

  // Update a single translation
  const updateTranslation = useCallback((key: string, value: string) => {
    setState((prev) => prev ? { ...prev, translations: { ...prev.translations, [key]: value } } : null);
  }, []);

  // Toggle protection
  const toggleProtection = useCallback((key: string) => {
    setState((prev) => {
      if (!prev) return null;
      const p = new Set(prev.protectedEntries || []);
      if (p.has(key)) p.delete(key); else p.add(key);
      return { ...prev, protectedEntries: p };
    });
  }, []);

  const toggleTechnicalBypass = useCallback((key: string) => {
    setState((prev) => {
      if (!prev) return null;
      const b = new Set(prev.technicalBypass || []);
      if (b.has(key)) b.delete(key); else b.add(key);
      return { ...prev, technicalBypass: b };
    });
  }, []);

  // Translate via Google Translate free API
  const translateGoogle = useCallback(async (text: string): Promise<string> => {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ar&dt=t&q=${encodeURIComponent(text)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error("Google Translate failed");
    const data = await r.json();
    return ((data?.[0] as [string, string][])?.map((s) => s[0]).join("") || "").trim();
  }, []);

  // Translate via MyMemory
  const translateMyMemory = useCallback(async (text: string): Promise<string> => {
    const emailParam = myMemoryEmail ? `&de=${encodeURIComponent(myMemoryEmail)}` : "";
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|ar${emailParam}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error("MyMemory failed");
    const data = await r.json();
    return (data?.responseData?.translatedText || "").trim();
  }, [myMemoryEmail]);

  // Translate via Gemini
  const translateGemini = useCallback(async (
    entries: Array<{ id: string; sourceText: string; context?: string; maxBytes?: number }>,
    onResult: (id: string, text: string) => void,
    onProgress: (done: number, total: number) => void
  ) => {
    const BATCH = AI_BATCH_SIZE;
    let done = 0;
    for (let i = 0; i < entries.length; i += BATCH) {
      if (stopRef.current) break;
      const batch = entries.slice(i, i + BATCH);
      const textsFormatted = batch.map((e, idx) => `${idx + 1}. "${e.sourceText}"`).join("\n");
      const systemPrompt = `أنت مترجم متخصص في ألعاب Zelda. ترجم كل نص إلى العربية بدون أرقام أو شرح. أعد كل ترجمة في سطر منفصل مرقم: "1. الترجمة"`;

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${userGeminiKey}`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\n${textsFormatted}` }] }],
          generationConfig: { maxOutputTokens: 2000 },
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (!r.ok) throw new Error(`Gemini error: ${r.status}`);
      const data = await r.json();
      const responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const lines = responseText.split("\n").filter((l: string) => /^\d+\./.test(l.trim()));
      for (let j = 0; j < batch.length; j++) {
        const line = lines[j] || "";
        const text = line.replace(/^\d+\.\s*/, "").replace(/^[""]|[""]$/g, "").trim();
        if (text) onResult(batch[j].id, text);
        done++;
      }
      onProgress(done, entries.length);
    }
  }, [userGeminiKey, geminiModel]);

  // Translate via Claude
  const translateClaude = useCallback(async (text: string): Promise<string> => {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": userClaudeKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 500,
        messages: [{ role: "user", content: `ترجم إلى العربية: "${text}"\nأعد الترجمة فقط.` }],
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error(`Claude error: ${r.status}`);
    const data = await r.json();
    return (data?.content?.[0]?.text || "").trim();
  }, [userClaudeKey]);

  // Main batch translate
  const handleBatchTranslate = useCallback(async (entriesToTranslate: ExtractedEntry[]) => {
    if (!state || translating) return;
    stopRef.current = false;
    setTranslating(true);
    setTranslateProgress(`جارٍ الترجمة بـ ${translationEngine}...`);

    const notTranslated = entriesToTranslate.filter((e) => {
      const k = entryKey(e);
      const isTech = isTechnicalText(e.original) && !(state.technicalBypass || new Set()).has(k);
      const isProtected = (state.protectedEntries || new Set()).has(k);
      return !isTech && !isProtected && !state.translations[k]?.trim();
    });

    if (notTranslated.length === 0) {
      setTranslateProgress("لا توجد إدخالات جديدة للترجمة");
      setTimeout(() => setTranslateProgress(""), 3000);
      setTranslating(false);
      return;
    }

    const updates: Record<string, string> = { ...state.translations };
    let done = 0;
    const total = notTranslated.length;

    try {
      if (translationEngine === "lovable") {
        const apiEntries = notTranslated.map((e) => ({
          id: entryKey(e),
          sourceText: e.original.replace(/[\uE000-\uE0FF\uFFF9-\uFFFC]/g, ""),
          maxBytes: e.maxBytes,
        }));

        const glossaryTerms = Array.from(glossaryMap.entries()).map(([src, tgt]) => ({ source: src, arabic: tgt }));

        const eventSource = await fetch(`${API_BASE}/ai/batch-translate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entries: apiEntries, glossaryTerms, gameTitle: "Zelda" }),
          signal: AbortSignal.timeout(300000),
        });

        if (!eventSource.ok) throw new Error(`API error: ${eventSource.status}`);
        const reader = eventSource.body?.getReader();
        if (!reader) throw new Error("No response body");
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          if (stopRef.current) { reader.cancel(); break; }
          const { done: streamDone, value } = await reader.read();
          if (streamDone) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";
          for (const chunk of lines) {
            if (!chunk.startsWith("data: ")) continue;
            try {
              const event = JSON.parse(chunk.slice(6));
              if (event.type === "result" && event.data?.id && event.data?.arabicText) {
                updates[event.data.id] = event.data.arabicText;
                done++;
                setState((prev) => prev ? { ...prev, translations: { ...prev.translations, [event.data.id]: event.data.arabicText } } : null);
              }
              if (event.type === "progress") {
                setTranslateProgress(`${event.done}/${event.total} مكتمل`);
              }
            } catch { /**/ }
          }
        }
      } else if (translationEngine === "gemini" && userGeminiKey) {
        const apiEntries = notTranslated.map((e) => ({
          id: entryKey(e),
          sourceText: e.original.replace(/[\uE000-\uE0FF\uFFF9-\uFFFC]/g, ""),
          maxBytes: e.maxBytes,
        }));
        await translateGemini(
          apiEntries,
          (id, text) => {
            updates[id] = text;
            setState((prev) => prev ? { ...prev, translations: { ...prev.translations, [id]: text } } : null);
          },
          (d, t) => setTranslateProgress(`${d}/${t} مكتمل`)
        );
      } else if (translationEngine === "google") {
        for (const entry of notTranslated) {
          if (stopRef.current) break;
          const k = entryKey(entry);
          const clean = entry.original.replace(/[\uE000-\uE0FF\uFFF9-\uFFFC]/g, "").trim();
          if (!clean) continue;
          try {
            const text = await translateGoogle(clean);
            if (text) {
              updates[k] = text;
              setState((prev) => prev ? { ...prev, translations: { ...prev.translations, [k]: text } } : null);
            }
          } catch { /**/ }
          done++;
          setTranslateProgress(`${done}/${total} مكتمل`);
          await new Promise((r) => setTimeout(r, 300));
        }
      } else if (translationEngine === "mymemory") {
        for (const entry of notTranslated) {
          if (stopRef.current) break;
          const k = entryKey(entry);
          const clean = entry.original.replace(/[\uE000-\uE0FF\uFFF9-\uFFFC]/g, "").trim();
          if (!clean) continue;
          try {
            const text = await translateMyMemory(clean);
            if (text) {
              updates[k] = text;
              setState((prev) => prev ? { ...prev, translations: { ...prev.translations, [k]: text } } : null);
            }
          } catch { /**/ }
          done++;
          setTranslateProgress(`${done}/${total} مكتمل`);
          await new Promise((r) => setTimeout(r, 500));
        }
      } else if (translationEngine === "claude" && userClaudeKey) {
        for (const entry of notTranslated) {
          if (stopRef.current) break;
          const k = entryKey(entry);
          const clean = entry.original.replace(/[\uE000-\uE0FF\uFFF9-\uFFFC]/g, "").trim();
          if (!clean) continue;
          try {
            const text = await translateClaude(clean);
            if (text) {
              updates[k] = text;
              setState((prev) => prev ? { ...prev, translations: { ...prev.translations, [k]: text } } : null);
            }
          } catch { /**/ }
          done++;
          setTranslateProgress(`${done}/${total} مكتمل`);
          await new Promise((r) => setTimeout(r, 1000));
        }
      }

      setState((prev) => prev ? { ...prev, translations: updates } : null);
      setTranslateProgress(`✅ اكتملت الترجمة: ${done} إدخال`);
    } catch (err) {
      setTranslateProgress(`❌ خطأ: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTranslating(false);
      setTimeout(() => setTranslateProgress(""), 5000);
    }
  }, [state, translating, translationEngine, glossaryMap, userGeminiKey, userClaudeKey, translateGemini, translateGoogle, translateMyMemory, translateClaude]);

  const stopTranslation = useCallback(() => { stopRef.current = true; }, []);

  // Fix tools
  const handleFixAllStuck = useCallback(() => {
    if (!state) return;
    const updates: Record<string, string> = {};
    let count = 0;
    for (const e of state.entries) {
      const k = entryKey(e);
      const t = state.translations[k];
      if (!t) continue;
      const { fixed, changes } = fixStuckChars(t);
      if (changes > 0) { updates[k] = fixed; count++; }
    }
    if (count > 0) setState((prev) => prev ? { ...prev, translations: { ...prev.translations, ...updates } } : null);
    setLastSaved(`✅ إصلاح الأحرف العالقة: ${count} إدخال`);
  }, [state]);

  const handleFixAllPunctuation = useCallback(() => {
    if (!state) return;
    const updates: Record<string, string> = {};
    let count = 0;
    for (const e of state.entries) {
      const k = entryKey(e);
      const t = state.translations[k];
      if (!t) continue;
      const fixed = t.replace(/\?/g, "؟").replace(/,(?!\s*\d)/g, "،").replace(/;/g, "؛");
      if (fixed !== t) { updates[k] = fixed; count++; }
    }
    if (count > 0) setState((prev) => prev ? { ...prev, translations: { ...prev.translations, ...updates } } : null);
    setLastSaved(`✅ إصلاح علامات الترقيم: ${count} إدخال`);
  }, [state]);

  const handleFixAllBrackets = useCallback(() => {
    if (!state) return;
    const updates: Record<string, string> = {};
    let count = 0;
    for (const e of state.entries) {
      const k = entryKey(e);
      const t = state.translations[k];
      if (!t) continue;
      const fixed = fixBrackets(e.original, t);
      if (fixed !== t) { updates[k] = fixed; count++; }
    }
    if (count > 0) setState((prev) => prev ? { ...prev, translations: { ...prev.translations, ...updates } } : null);
    setLastSaved(`✅ إصلاح الأقواس: ${count} إدخال`);
  }, [state]);

  const handleFixAllDiacritics = useCallback(() => {
    if (!state) return;
    const updates: Record<string, string> = {};
    let count = 0;
    for (const e of state.entries) {
      const k = entryKey(e);
      const t = state.translations[k];
      if (!t) continue;
      const { fixed, changes } = fixDiacritics(t);
      if (changes > 0) { updates[k] = fixed; count++; }
    }
    if (count > 0) setState((prev) => prev ? { ...prev, translations: { ...prev.translations, ...updates } } : null);
    setLastSaved(`✅ إصلاح التشكيل: ${count} إدخال`);
  }, [state]);

  const handleFixAllSpaces = useCallback(() => {
    if (!state) return;
    const updates: Record<string, string> = {};
    let count = 0;
    for (const e of state.entries) {
      const k = entryKey(e);
      const t = state.translations[k];
      if (!t) continue;
      const { fixed, changes } = fixSpaces(t);
      if (changes > 0) { updates[k] = fixed; count++; }
    }
    if (count > 0) setState((prev) => prev ? { ...prev, translations: { ...prev.translations, ...updates } } : null);
    setLastSaved(`✅ إصلاح المسافات: ${count} إدخال`);
  }, [state]);

  const handleFixAllHamza = useCallback(() => {
    if (!state) return;
    const updates: Record<string, string> = {};
    let count = 0;
    for (const e of state.entries) {
      const k = entryKey(e);
      const t = state.translations[k];
      if (!t) continue;
      const { fixed, changes } = fixHamza(t);
      if (changes > 0) { updates[k] = fixed; count++; }
    }
    if (count > 0) setState((prev) => prev ? { ...prev, translations: { ...prev.translations, ...updates } } : null);
    setLastSaved(`✅ إصلاح الهمزات: ${count} إدخال`);
  }, [state]);

  const handleFixAllLonelyLam = useCallback(() => {
    if (!state) return;
    const updates: Record<string, string> = {};
    let count = 0;
    for (const e of state.entries) {
      const k = entryKey(e);
      const t = state.translations[k];
      if (!t) continue;
      const { fixed, changes } = fixLonelyLam(t);
      if (changes > 0) { updates[k] = fixed; count++; }
    }
    if (count > 0) setState((prev) => prev ? { ...prev, translations: { ...prev.translations, ...updates } } : null);
    setLastSaved(`✅ إصلاح اللام المنفردة: ${count} إدخال`);
  }, [state]);

  const handleFixAllTaaHaa = useCallback(() => {
    if (!state) return;
    const updates: Record<string, string> = {};
    let count = 0;
    for (const e of state.entries) {
      const k = entryKey(e);
      const t = state.translations[k];
      if (!t) continue;
      const { fixed, changes } = fixTaaMarbutaHaa(t);
      if (changes > 0) { updates[k] = fixed; count++; }
    }
    if (count > 0) setState((prev) => prev ? { ...prev, translations: { ...prev.translations, ...updates } } : null);
    setLastSaved(`✅ إصلاح التاء/الهاء: ${count} إدخال`);
  }, [state]);

  const handleFixAllReversed = useCallback(() => {
    if (!state) return;
    const { unReverseBidi } = { unReverseBidi: reverseBidi };
    const updates: Record<string, string> = {};
    const newProtected = new Set(state.protectedEntries || []);
    let count = 0;
    for (const e of state.entries) {
      const k = entryKey(e);
      if (!hasArabicChars(e.original)) continue;
      if (newProtected.has(k)) continue;
      const existing = state.translations[k]?.trim();
      if (existing && existing !== e.original) continue;
      const corrected = unReverseBidi(e.original);
      if (corrected !== e.original) {
        updates[k] = corrected;
        newProtected.add(k);
        count++;
      }
    }
    if (count > 0) setState((prev) => prev ? { ...prev, translations: { ...prev.translations, ...updates }, protectedEntries: newProtected } : null);
    setLastSaved(`✅ إصلاح BiDi المعكوس: ${count} إدخال`);
  }, [state]);

  const handleRestoreAllTags = useCallback(() => {
    if (!state) return;
    const updates: Record<string, string> = {};
    let count = 0;
    for (const e of state.entries) {
      if (!hasTechnicalTags(e.original)) continue;
      const k = entryKey(e);
      const t = state.translations[k];
      if (!t) continue;
      const fixed = restoreTagsLocally(e.original, t);
      if (fixed !== t) { updates[k] = fixed; count++; }
    }
    if (count > 0) setState((prev) => prev ? { ...prev, translations: { ...prev.translations, ...updates } } : null);
    setLastSaved(`✅ استعادة الرموز: ${count} إدخال`);
  }, [state]);

  // Export JSON
  const handleExportJSON = useCallback(() => {
    if (!state) return;
    const output: Record<string, string> = {};
    for (const e of state.entries) {
      const k = entryKey(e);
      const t = state.translations[k];
      if (t) output[k] = t;
    }
    const blob = new Blob([JSON.stringify(output, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `translations_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [state]);

  // Smart review via AI
  const handleSmartReview = useCallback(async () => {
    if (!state || reviewing) return;
    setReviewing(true);
    setShowReview(true);
    setReviewFindings([]);

    const toReview = state.entries
      .filter((e) => state.translations[entryKey(e)]?.trim())
      .slice(0, 100)
      .map((e) => ({
        key: entryKey(e),
        original: e.original,
        translation: state.translations[entryKey(e)],
        maxBytes: e.maxBytes,
      }));

    try {
      const r = await fetch(`${API_BASE}/ai/smart-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: toReview }),
        signal: AbortSignal.timeout(120000),
      });

      if (!r.ok) throw new Error(`Review error: ${r.status}`);
      const reader = r.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";
        for (const chunk of lines) {
          if (!chunk.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(chunk.slice(6));
            if (event.findings) setReviewFindings(event.findings);
          } catch { /**/ }
        }
      }
    } catch (err) {
      console.error("Smart review failed:", err);
    } finally {
      setReviewing(false);
    }
  }, [state, reviewing]);

  const applyReviewFix = useCallback((key: string, fix: string) => {
    setState((prev) => prev ? { ...prev, translations: { ...prev.translations, [key]: fix } } : null);
    setReviewFindings((prev) => prev.filter((f) => f.key !== key));
  }, []);

  const handleGetAlternatives = useCallback(async (entry: ExtractedEntry) => {
    const k = entryKey(entry);
    const translation = state?.translations[k] || "";
    if (!translation) return;
    try {
      const r = await fetch(`${API_BASE}/ai/alternatives`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: k, original: entry.original, translation }),
      });
      const data = await r.json();
      if (data.alternatives) setQuickAlternatives({ key: k, alternatives: data.alternatives });
    } catch { /**/ }
  }, [state]);

  return {
    state, setState,
    search, setSearch,
    filterFile, setFilterFile,
    filterCategory, setFilterCategory,
    filterStatus, toggleFilterStatus,
    filterTechnical, setFilterTechnical,
    translateProgress, translating,
    lastSaved,
    currentPage, setCurrentPage,
    totalPages,
    filteredEntries, pageEntries,
    msbtFiles,
    qualityStats,
    translationEngine, setTranslationEngine,
    userGeminiKey, setUserGeminiKey,
    userClaudeKey, setUserClaudeKey,
    myMemoryEmail, setMyMemoryEmail,
    geminiModel, setGeminiModel,
    glossaryText, saveGlossary, glossaryMap,
    updateTranslation,
    toggleProtection, toggleTechnicalBypass,
    handleBatchTranslate, stopTranslation,
    handleFixAllStuck, handleFixAllPunctuation, handleFixAllBrackets,
    handleFixAllDiacritics, handleFixAllSpaces, handleFixAllHamza,
    handleFixAllLonelyLam, handleFixAllTaaHaa, handleFixAllReversed,
    handleRestoreAllTags,
    handleExportJSON,
    handleSmartReview, applyReviewFix, reviewing,
    showReview, setShowReview, reviewFindings,
    quickAlternatives, setQuickAlternatives, handleGetAlternatives,
    fixPreview, setFixPreview,
  };
}
