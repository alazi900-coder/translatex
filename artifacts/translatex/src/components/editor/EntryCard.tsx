import { useState, useCallback, useRef } from "react";
import { Lock, Unlock, Tag, ChevronDown, ChevronUp, Wand2, RefreshCw, Layers, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { utf16leByteLength } from "@/lib/byte-utils";
import { calcConfidence, confidenceColor, confidenceLabel } from "@/lib/confidence-score";
import { hasTechnicalTags, displayOriginal, isTechnicalText, entryKey } from "@/lib/types";
import type { ExtractedEntry } from "@/lib/types";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
const API_BASE = (BASE_URL === "" || BASE_URL === "/") ? "/api" : BASE_URL.replace(/\/[^/]*$/, "") + "/api";

interface EntryCardProps {
  entry: ExtractedEntry;
  translation: string;
  isProtected: boolean;
  isBypass: boolean;
  glossaryMap: Map<string, string>;
  onUpdate: (key: string, value: string) => void;
  onToggleProtect: (key: string) => void;
  onToggleBypass: (key: string) => void;
  onGetAlternatives: (entry: ExtractedEntry) => void;
}

function ByteMeter({ current, max }: { current: number; max: number }) {
  const pct = Math.min(100, (current / Math.max(max, 1)) * 100);
  const status = current > max ? "error" : current > max * 0.9 ? "warn" : "ok";
  const barColor = status === "error" ? "bg-red-500" : status === "warn" ? "bg-amber-500" : "bg-emerald-500";
  const textColor = status === "error" ? "text-red-400" : status === "warn" ? "text-amber-400" : "text-emerald-400";

  return (
    <div className="space-y-1">
      <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <div className={`text-xs ${textColor} text-left`}>
        {current} / {max} بايت ({Math.round(pct)}%)
      </div>
    </div>
  );
}

function GlossaryHint({ original, glossaryMap }: { original: string; glossaryMap: Map<string, string> }) {
  const hints: { src: string; tgt: string }[] = [];
  const lowerOrig = original.toLowerCase();
  for (const [src, tgt] of glossaryMap) {
    if (lowerOrig.includes(src.toLowerCase())) hints.push({ src, tgt });
  }
  if (hints.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {hints.slice(0, 4).map((h) => (
        <span key={h.src} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <span className="opacity-70">{h.src}</span>→<span>{h.tgt}</span>
        </span>
      ))}
    </div>
  );
}

export default function EntryCard({
  entry,
  translation,
  isProtected,
  isBypass,
  glossaryMap,
  onUpdate,
  onToggleProtect,
  onToggleBypass,
  onGetAlternatives,
}: EntryCardProps) {
  const key = entryKey(entry);
  const [expanded, setExpanded] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [backTranslation, setBackTranslation] = useState("");
  const [showBT, setShowBT] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const byteLen = utf16leByteLength(translation || "");
  const isTech = isTechnicalText(entry.original);
  const hasTags = hasTechnicalTags(entry.original);
  const conf = translation ? calcConfidence({ original: entry.original, translation, maxBytes: entry.maxBytes }) : 0;

  // Check missing tags
  const origTags = entry.original.match(/[\uFFF9-\uFFFC\uE000-\uF8FF]/g) || [];
  const transTags = (translation || "").match(/[\uFFF9-\uFFFC\uE000-\uF8FF]/g) || [];
  const missingTags = origTags.length > 0 && transTags.length < origTags.length;

  const handleAITranslate = useCallback(async () => {
    setTranslating(true);
    try {
      const r = await fetch(`${API_BASE}/ai/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceText: entry.original.replace(/[\uE000-\uE0FF\uFFF9-\uFFFC]/g, ""),
          maxBytes: entry.maxBytes,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      if (data.arabicText) onUpdate(key, data.arabicText);
    } catch (err) {
      console.error("AI translate failed:", err);
    } finally {
      setTranslating(false);
    }
  }, [entry, key, onUpdate]);

  const handleBackTranslate = useCallback(async () => {
    if (!translation) return;
    setShowBT(true);
    setBackTranslation("جارٍ الترجمة العكسية...");
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ar&tl=en&dt=t&q=${encodeURIComponent(translation.slice(0, 200))}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error("Failed");
      const data = await r.json();
      const text = ((data?.[0] as [string, string][])?.map((s) => s[0]).join("") || "").trim();
      setBackTranslation(text || "—");
    } catch {
      setBackTranslation("فشلت الترجمة العكسية");
    }
  }, [translation]);

  const handleTextChange = (v: string) => {
    onUpdate(key, v);
    // Auto-resize
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  return (
    <div className={`rounded-xl border transition-all ${
      isProtected ? "border-amber-500/30 bg-amber-500/5" :
      isTech && !isBypass ? "border-border/20 bg-muted/10 opacity-70" :
      missingTags ? "border-red-500/30 bg-red-500/5" :
      translation ? "border-border/30 bg-card/40" :
      "border-border/20 bg-card/20"
    }`}>
      {/* Header */}
      <div className="flex items-start gap-2 p-3 pb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <span className="text-xs font-mono text-muted-foreground/70 truncate max-w-[200px]" title={entry.msbtFile}>
              {entry.msbtFile.split("/").pop()}
            </span>
            <span className="text-muted-foreground/30">·</span>
            <span className="text-xs text-muted-foreground/70">{entry.label}</span>
            {hasTags && <Tag className="w-3 h-3 text-blue-400" />}
            {isTech && !isBypass && <Badge variant="outline" className="text-xs py-0 px-1 text-muted-foreground border-muted-foreground/20">تقني</Badge>}
            {isProtected && <Badge className="text-xs py-0 px-1 bg-amber-500/10 text-amber-400 border-amber-500/20">محمي</Badge>}
            {missingTags && <Badge className="text-xs py-0 px-1 bg-red-500/10 text-red-400 border-red-500/20">رموز ناقصة ⚠️</Badge>}
          </div>

          {/* Original text display */}
          <div className="text-sm leading-relaxed text-foreground/90 font-mono whitespace-pre-wrap break-words" dir="auto">
            {displayOriginal(entry.original)}
          </div>
          <GlossaryHint original={entry.original} glossaryMap={glossaryMap} />
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-1 shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost" size="icon"
                className={`w-7 h-7 ${isProtected ? "text-amber-400" : "text-muted-foreground"}`}
                onClick={() => onToggleProtect(key)}
              >
                {isProtected ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{isProtected ? "إلغاء الحماية" : "حماية من إعادة الترجمة"}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost" size="icon"
                className="w-7 h-7 text-muted-foreground hover:text-amber-400"
                onClick={handleAITranslate}
                disabled={translating}
              >
                {translating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">ترجمة AI</TooltipContent>
          </Tooltip>

          {translation && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost" size="icon"
                  className="w-7 h-7 text-muted-foreground hover:text-blue-400"
                  onClick={() => onGetAlternatives(entry)}
                >
                  <Layers className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">بدائل للترجمة</TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost" size="icon"
                className="w-7 h-7 text-muted-foreground"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{expanded ? "طي" : "توسعة"}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Translation textarea */}
      <div className="px-3 pb-2">
        {isTech && !isBypass ? (
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground flex-1">نص تقني — لا يحتاج ترجمة عادةً</p>
            <Button variant="ghost" size="sm" className="text-xs h-6" onClick={() => onToggleBypass(key)}>
              ترجمة على أي حال
            </Button>
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            value={translation}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder="اكتب الترجمة العربية هنا..."
            dir="rtl"
            rows={2}
            className="w-full bg-muted/30 border border-border/30 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-amber-500/50 focus:bg-muted/50 transition-colors placeholder:text-muted-foreground/40 font-sans"
            style={{ minHeight: "3rem" }}
          />
        )}
      </div>

      {/* Byte meter + confidence */}
      {translation && (
        <div className="px-3 pb-3 space-y-1.5">
          <ByteMeter current={byteLen} max={entry.maxBytes} />
          <div className="flex items-center gap-2">
            <span className={`text-xs px-1.5 py-0.5 rounded border ${confidenceColor(conf)}`}>
              ثقة {confidenceLabel(conf)} ({conf}%)
            </span>
            {showBT ? (
              <span className="text-xs text-muted-foreground truncate">← {backTranslation}</span>
            ) : (
              <button
                className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                onClick={handleBackTranslate}
              >
                <Eye className="w-3 h-3 inline ml-1" />
                ترجمة عكسية
              </button>
            )}
          </div>
        </div>
      )}

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border/20 px-3 py-3 space-y-2 text-xs text-muted-foreground">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-muted-foreground/50">الملف:</span>
              <p className="font-mono text-foreground/70 break-all">{entry.msbtFile}</p>
            </div>
            <div>
              <span className="text-muted-foreground/50">الفهرس:</span>
              <p className="font-mono text-foreground/70">{entry.index}</p>
            </div>
            <div>
              <span className="text-muted-foreground/50">الحجم الأصلي:</span>
              <p className="font-mono text-foreground/70">{utf16leByteLength(entry.original)} بايت</p>
            </div>
            <div>
              <span className="text-muted-foreground/50">الحد الأقصى:</span>
              <p className="font-mono text-foreground/70">{entry.maxBytes} بايت</p>
            </div>
          </div>
          {hasTags && (
            <div className="p-2 rounded bg-blue-500/5 border border-blue-500/10 text-blue-400">
              ⚠️ يحتوي على {origTags.length} رمز تقني — يجب الحفاظ عليها في الترجمة
            </div>
          )}
        </div>
      )}
    </div>
  );
}
