import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Upload, FileUp, CheckCircle2, AlertCircle, Loader2, ChevronRight, Sword, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { idbSet } from "@/lib/idb-storage";
import type { ExtractedEntry } from "@/lib/types";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
const API_BASE = (BASE_URL === "" || BASE_URL === "/") ? "/api" : BASE_URL.replace(/\/[^/]*$/, "") + "/api";

type Stage = "idle" | "uploading" | "extracting" | "done" | "error";

interface ExtractStats {
  totalFiles: number;
  msbtFiles: number;
  totalEntries: number;
  skipped: number;
  langFileName: string;
}

function DropZone({
  label,
  sub,
  accept,
  file,
  onFile,
  required,
}: {
  label: string;
  sub: string;
  accept: string;
  file: File | null;
  onFile: (f: File) => void;
  required?: boolean;
}) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  };

  return (
    <div
      className={`relative rounded-xl border-2 border-dashed transition-all cursor-pointer p-8 text-center
        ${drag ? "border-amber-400 bg-amber-500/10" : file ? "border-emerald-500/50 bg-emerald-500/5" : "border-border/40 bg-card/30 hover:border-border hover:bg-card/60"}`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={(e) => { if (e.target.files?.[0]) onFile(e.target.files[0]); }} />
      {file ? (
        <div className="flex flex-col items-center gap-2">
          <CheckCircle2 className="w-10 h-10 text-emerald-400" />
          <p className="font-semibold text-emerald-300">{file.name}</p>
          <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} كيلوبايت</p>
          <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">جاهز</Badge>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className={`w-14 h-14 rounded-full flex items-center justify-center ${required ? "bg-amber-500/10 text-amber-400" : "bg-muted text-muted-foreground"}`}>
            <FileUp className="w-7 h-7" />
          </div>
          <p className="font-semibold">{label}</p>
          <p className="text-sm text-muted-foreground">{sub}</p>
          {required && <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-xs">مطلوب</Badge>}
          {!required && <Badge variant="outline" className="text-xs text-muted-foreground">اختياري</Badge>}
        </div>
      )}
    </div>
  );
}

export default function ProcessPage() {
  const [, navigate] = useLocation();
  const [langFile, setLangFile] = useState<File | null>(null);
  const [dictFile, setDictFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [stats, setStats] = useState<ExtractStats | null>(null);
  const [error, setError] = useState("");
  const [entryCount, setEntryCount] = useState(0);
  const [mergeMode, setMergeMode] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((msg: string) => {
    setLogs((prev) => [...prev, msg]);
    setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  const handleExtract = async () => {
    if (!langFile) return;
    setStage("uploading");
    setLogs([]);
    setError("");
    setStats(null);

    const formData = new FormData();
    formData.append("langFile", langFile);
    if (dictFile) formData.append("dictFile", dictFile);

    try {
      addLog(`📤 إرسال الملف: ${langFile.name} (${(langFile.size / 1024).toFixed(1)} كيلوبايت)`);
      setStage("extracting");
      addLog("⏳ جارٍ الاستخراج، قد يستغرق هذا بضع ثوانٍ...");

      const r = await fetch(`${API_BASE}/extract`, {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(120000),
      });

      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
        throw new Error(err.error || `فشل الاستخراج: HTTP ${r.status}`);
      }

      const data = await r.json() as {
        entries: ExtractedEntry[];
        stats: ExtractStats;
        logs: string[];
      };

      // Show server logs
      for (const log of (data.logs || [])) addLog(log);
      addLog(`\n✨ تم استخراج ${data.entries.length} إدخال بنجاح!`);

      setStats(data.stats);
      setEntryCount(data.entries.length);

      // Save to IDB
      let entriesToSave = data.entries;
      if (mergeMode) {
        // Load existing and merge
        try {
          const { idbGet } = await import("@/lib/idb-storage");
          const existing = await idbGet<{ entries: ExtractedEntry[]; translations: Record<string, string> }>("editorState");
          if (existing?.entries) {
            const existingKeys = new Set(existing.entries.map((e) => `${e.msbtFile}:${e.index}`));
            const newEntries = data.entries.filter((e) => !existingKeys.has(`${e.msbtFile}:${e.index}`));
            entriesToSave = [...existing.entries, ...newEntries];
            addLog(`🔀 دمج: ${existing.entries.length} موجود + ${newEntries.length} جديد = ${entriesToSave.length} إجمالي`);
            await idbSet("editorState", {
              entries: entriesToSave,
              translations: existing.translations || {},
              langFileName: langFile.name,
              dictFileName: dictFile?.name,
            });
          }
        } catch {
          await idbSet("editorState", {
            entries: data.entries,
            translations: {},
            langFileName: langFile.name,
            dictFileName: dictFile?.name,
          });
        }
      } else {
        await idbSet("editorState", {
          entries: data.entries,
          translations: {},
          langFileName: langFile.name,
          dictFileName: dictFile?.name,
        });
      }

      addLog("💾 تم الحفظ في المتصفح. جاهز للمحرر!");
      setStage("done");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      addLog(`❌ خطأ: ${msg}`);
      setStage("error");
    }
  };

  const reset = () => {
    setLangFile(null);
    setDictFile(null);
    setStage("idle");
    setLogs([]);
    setError("");
    setStats(null);
  };

  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
          <button onClick={() => navigate("/")} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <Sword className="w-5 h-5 text-amber-400" />
            <span className="font-bold text-amber-400">TranslateX</span>
          </button>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <span className="text-amber-400 font-medium">استخراج الملفات</span>
          </div>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 pt-24 pb-16">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm mb-4">
            <Upload className="w-3.5 h-3.5" />
            الخطوة 1 من 2
          </div>
          <h1 className="text-3xl font-bold mb-3">رفع ملفات اللعبة</h1>
          <p className="text-muted-foreground">ارفع ملف .zs الخاص باللغة لاستخراج النصوص القابلة للترجمة</p>
        </div>

        {stage === "idle" || stage === "error" ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DropZone
                label="ملف اللغة (Lang)"
                sub="ملف .zs أو .sarc المضغوط"
                accept=".zs,.sarc,.zstd"
                file={langFile}
                onFile={setLangFile}
                required
              />
              <DropZone
                label="قاموس الضغط ZsDic"
                sub="ZsDic.pack.zs — مطلوب لملفات .sarc.zs"
                accept=".zs,.sarc,.zstd"
                file={dictFile}
                onFile={setDictFile}
              />
            </div>

            {/* Options */}
            <div className="flex items-center gap-3 p-4 rounded-lg border border-border/30 bg-card/20">
              <input
                type="checkbox"
                id="merge"
                checked={mergeMode}
                onChange={(e) => setMergeMode(e.target.checked)}
                className="w-4 h-4 accent-amber-400"
              />
              <label htmlFor="merge" className="text-sm cursor-pointer">
                <span className="font-medium">وضع الدمج</span>
                <span className="text-muted-foreground mr-2">— إضافة الإدخالات الجديدة دون حذف الترجمات الموجودة</span>
              </label>
            </div>

            {error && (
              <div className="flex gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium mb-1">فشل الاستخراج</p>
                  <p className="text-sm">{error}</p>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                size="lg"
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-black font-bold h-12"
                onClick={handleExtract}
                disabled={!langFile}
              >
                <Upload className="w-5 h-5 ml-2" />
                بدء الاستخراج
              </Button>
              {(langFile || dictFile) && (
                <Button size="lg" variant="outline" onClick={reset} className="h-12">
                  <RotateCcw className="w-4 h-4" />
                </Button>
              )}
            </div>

            {/* Tips */}
            <div className="p-4 rounded-lg bg-card/20 border border-border/20 text-sm text-muted-foreground space-y-1">
              <p className="font-medium text-foreground mb-2">💡 نصائح:</p>
              <p>• ملف اللغة: <code className="bg-muted px-1 rounded text-xs">USen.Product.120.sarc.zs</code> أو <code className="bg-muted px-1 rounded text-xs">Bootup_USen.pack.zs</code></p>
              <p>• قاموس الضغط ضروري لملفات <code className="bg-muted px-1 rounded text-xs">.sarc.zs</code> — يوجد في: <code className="bg-muted px-1 rounded text-xs">Pack/ZsDic.pack.zs</code></p>
              <p>• مسار القاموس في اللعبة: <code className="bg-muted px-1 rounded text-xs">romfs/Pack/ZsDic.pack.zs</code></p>
            </div>
          </div>
        ) : stage === "extracting" || stage === "uploading" ? (
          <div className="space-y-6">
            <div className="flex items-center justify-center gap-3 py-8">
              <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
              <div>
                <p className="font-semibold text-lg">{stage === "uploading" ? "جارٍ الرفع..." : "جارٍ الاستخراج..."}</p>
                <p className="text-sm text-muted-foreground">يرجى الانتظار</p>
              </div>
            </div>

            {/* Live logs */}
            <div className="rounded-xl border border-border/30 bg-card/20 overflow-hidden">
              <div className="px-4 py-2 border-b border-border/20 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-mono text-muted-foreground">سجل العمليات</span>
              </div>
              <div className="p-4 font-mono text-xs space-y-1 max-h-64 overflow-y-auto">
                {logs.map((log, i) => (
                  <p key={i} className={`${log.startsWith("❌") ? "text-red-400" : log.startsWith("✅") || log.startsWith("✨") ? "text-emerald-400" : "text-muted-foreground"}`}>
                    {log}
                  </p>
                ))}
                <div ref={logsEndRef} />
              </div>
            </div>
          </div>
        ) : (
          /* Done */
          <div className="space-y-6">
            <div className="text-center py-8">
              <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-emerald-300 mb-2">اكتمل الاستخراج!</h2>
              <p className="text-muted-foreground">تم تحضير <span className="text-foreground font-semibold">{entryCount.toLocaleString()}</span> إدخال للترجمة</p>
            </div>

            {stats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "الإدخالات", value: stats.totalEntries.toLocaleString(), color: "text-amber-400" },
                  { label: "ملفات MSBT", value: stats.msbtFiles.toString(), color: "text-blue-400" },
                  { label: "جميع الملفات", value: stats.totalFiles.toString(), color: "text-purple-400" },
                  { label: "تم تخطيه", value: stats.skipped.toString(), color: "text-muted-foreground" },
                ].map((s) => (
                  <div key={s.label} className="text-center p-4 rounded-lg bg-card/30 border border-border/20">
                    <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                    <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Show last few logs */}
            <div className="rounded-xl border border-border/30 bg-card/20 overflow-hidden">
              <div className="p-4 font-mono text-xs space-y-1 max-h-40 overflow-y-auto">
                {logs.slice(-8).map((log, i) => (
                  <p key={i} className={`${log.startsWith("❌") ? "text-red-400" : log.startsWith("✅") || log.startsWith("✨") || log.startsWith("💾") ? "text-emerald-400" : "text-muted-foreground"}`}>
                    {log}
                  </p>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                size="lg"
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-black font-bold h-12"
                onClick={() => navigate("/editor")}
              >
                فتح المحرر
                <ChevronRight className="w-5 h-5 mr-2" />
              </Button>
              <Button size="lg" variant="outline" onClick={reset} className="h-12">
                <RotateCcw className="w-4 h-4 ml-2" />
                ملف جديد
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
