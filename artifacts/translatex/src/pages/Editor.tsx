import { useState } from "react";
import { useLocation } from "wouter";
import {
  Search, Filter, Download, Wand2, Square, ChevronRight, ChevronLeft,
  Settings2, Sword, BookOpen, RotateCcw, Wrench, Star, X, CheckCircle2,
  AlertTriangle, Loader2, Upload, RefreshCw, Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import EntryCard from "@/components/editor/EntryCard";
import { useEditorState } from "@/hooks/useEditorState";
import { PAGE_SIZE, FILE_CATEGORIES, entryKey } from "@/lib/types";

const ENGINE_LABELS: Record<string, { label: string; color: string; note: string }> = {
  lovable: { label: "GPT-4o Mini", color: "text-emerald-400", note: "مدمج — مجاني" },
  gemini: { label: "Gemini 2.5", color: "text-blue-400", note: "يحتاج مفتاح API" },
  claude: { label: "Claude Haiku", color: "text-purple-400", note: "يحتاج مفتاح API" },
  google: { label: "Google Translate", color: "text-amber-400", note: "مجاني — بدون AI" },
  mymemory: { label: "MyMemory", color: "text-rose-400", note: "مجاني — ذاكرة ترجمة" },
};

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{done.toLocaleString()} مترجم</span>
        <span>{pct}%</span>
        <span>{total.toLocaleString()} إجمالي</span>
      </div>
    </div>
  );
}

export default function EditorPage() {
  const [, navigate] = useLocation();
  const [showSettings, setShowSettings] = useState(false);
  const [showGlossary, setShowGlossary] = useState(false);
  const [showFixTools, setShowFixTools] = useState(false);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [activeFilters, setActiveFilters] = useState(false);

  const es = useEditorState();

  if (!es.state || es.state.entries.length === 0) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center gap-6" dir="rtl">
        <Sword className="w-12 h-12 text-amber-400" />
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">لا توجد بيانات في المحرر</h2>
          <p className="text-muted-foreground mb-6">ارفع ملفات اللعبة أولاً لاستخراج النصوص</p>
          <div className="flex gap-3 justify-center">
            <Button className="bg-amber-500 hover:bg-amber-400 text-black font-bold" onClick={() => navigate("/process")}>
              <Upload className="w-4 h-4 ml-2" />
              رفع الملفات
            </Button>
            <Button variant="outline" onClick={() => navigate("/")}>الرئيسية</Button>
          </div>
        </div>
      </div>
    );
  }

  const { state, qualityStats, filteredEntries, pageEntries, totalPages, currentPage, msbtFiles } = es;
  const translatedCount = qualityStats.translated;
  const totalCount = qualityStats.total;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col" dir="rtl">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/95 backdrop-blur-sm">
        <div className="flex items-center gap-2 px-3 h-12">
          {/* Logo */}
          <button onClick={() => navigate("/")} className="flex items-center gap-1.5 hover:opacity-80 transition-opacity shrink-0">
            <Sword className="w-4 h-4 text-amber-400" />
            <span className="font-bold text-amber-400 text-sm hidden sm:block">TranslateX</span>
          </button>

          <div className="text-border/40 mx-1 hidden sm:block">|</div>

          {/* Progress summary */}
          <div className="flex items-center gap-2 text-sm shrink-0">
            <span className="text-emerald-400 font-semibold">{translatedCount.toLocaleString()}</span>
            <span className="text-muted-foreground">/</span>
            <span className="font-medium">{totalCount.toLocaleString()}</span>
            <span className="text-muted-foreground text-xs hidden md:block">إدخال مترجم</span>
          </div>

          {/* Search */}
          <div className="flex-1 max-w-xs mx-2">
            <div className="relative">
              <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={es.search}
                onChange={(e) => { es.setSearch(e.target.value); es.setCurrentPage(0); }}
                placeholder="بحث..."
                className="h-8 pr-8 text-sm bg-muted/30 border-border/30 focus:border-amber-500/50"
                dir="rtl"
              />
              {es.search && (
                <button onClick={() => es.setSearch("")} className="absolute left-2 top-1/2 -translate-y-1/2">
                  <X className="w-3 h-3 text-muted-foreground" />
                </button>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Translate / Stop */}
            {es.translating ? (
              <Button size="sm" variant="destructive" className="h-8 px-3 gap-1" onClick={es.stopTranslation}>
                <Square className="w-3.5 h-3.5" />
                <span className="text-xs hidden sm:block">إيقاف</span>
              </Button>
            ) : (
              <Button
                size="sm"
                className="h-8 px-3 gap-1 bg-emerald-600 hover:bg-emerald-500 text-white"
                onClick={() => es.handleBatchTranslate(filteredEntries)}
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span className="text-xs hidden sm:block">ترجمة</span>
              </Button>
            )}

            {/* Fix tools */}
            <Button size="sm" variant="outline" className="h-8 px-2 border-border/40" onClick={() => setShowFixTools(true)}>
              <Wrench className="w-3.5 h-3.5" />
            </Button>

            {/* Review */}
            <Button size="sm" variant="outline" className="h-8 px-2 border-border/40" onClick={() => { setShowReviewDialog(true); es.handleSmartReview(); }}>
              <Star className="w-3.5 h-3.5" />
            </Button>

            {/* Filters */}
            <Button
              size="sm"
              variant={activeFilters ? "default" : "outline"}
              className={`h-8 px-2 border-border/40 ${activeFilters ? "bg-amber-500/20 text-amber-400 border-amber-500/30" : ""}`}
              onClick={() => setActiveFilters(!activeFilters)}
            >
              <Filter className="w-3.5 h-3.5" />
            </Button>

            {/* Export */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 px-2 border-border/40">
                  <Download className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={es.handleExportJSON}>
                  <Download className="w-4 h-4 ml-2" />
                  تصدير JSON
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowGlossary(true)}>
                  <BookOpen className="w-4 h-4 ml-2" />
                  المسرد
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Settings */}
            <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setShowSettings(true)}>
              <Settings2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="px-3 pb-2">
          <ProgressBar done={translatedCount} total={totalCount} />
        </div>

        {/* Translate progress message */}
        {es.translateProgress && (
          <div className="px-3 pb-1.5 text-xs text-emerald-400 font-mono">{es.translateProgress}</div>
        )}

        {/* Last saved */}
        {es.lastSaved && (
          <div className="px-3 pb-1 text-xs text-muted-foreground/60">{es.lastSaved}</div>
        )}
      </header>

      {/* Filters Panel */}
      {activeFilters && (
        <div className="border-b border-border/30 bg-card/30 px-3 py-3">
          <div className="flex flex-wrap gap-3 items-center">
            {/* File filter */}
            <Select value={es.filterFile} onValueChange={(v) => { es.setFilterFile(v); es.setCurrentPage(0); }}>
              <SelectTrigger className="h-8 w-44 text-xs bg-muted/30 border-border/30">
                <SelectValue placeholder="كل الملفات" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الملفات</SelectItem>
                {msbtFiles.map((f) => (
                  <SelectItem key={f} value={f}>{f.split("/").pop()}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Category filter */}
            <Select value={es.filterCategory} onValueChange={(v) => { es.setFilterCategory(v); es.setCurrentPage(0); }}>
              <SelectTrigger className="h-8 w-44 text-xs bg-muted/30 border-border/30">
                <SelectValue placeholder="كل الفئات" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الفئات</SelectItem>
                {FILE_CATEGORIES.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.emoji} {c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Technical filter */}
            <Select value={es.filterTechnical} onValueChange={(v) => es.setFilterTechnical(v as "all" | "only" | "exclude")}>
              <SelectTrigger className="h-8 w-36 text-xs bg-muted/30 border-border/30">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="only">التقنية فقط</SelectItem>
                <SelectItem value="exclude">بدون التقنية</SelectItem>
              </SelectContent>
            </Select>

            {/* Quick status filters */}
            {[
              { id: "empty", label: "غير مترجم", color: "text-muted-foreground" },
              { id: "translated", label: "مترجم", color: "text-emerald-400" },
              { id: "tags", label: "يحوي رموز", color: "text-blue-400" },
              { id: "protected", label: "محمي", color: "text-amber-400" },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => { es.toggleFilterStatus(f.id); es.setCurrentPage(0); }}
                className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                  es.filterStatus.has(f.id)
                    ? "bg-primary/20 border-primary/40 text-primary"
                    : "border-border/30 text-muted-foreground hover:border-border"
                }`}
              >
                {f.label}
              </button>
            ))}

            {/* Result count */}
            <span className="text-xs text-muted-foreground mr-auto">
              {filteredEntries.length.toLocaleString()} نتيجة
            </span>
          </div>
        </div>
      )}

      {/* Stats strip */}
      <div className="flex items-center gap-4 px-3 py-2 border-b border-border/20 text-xs text-muted-foreground overflow-x-auto">
        <span className="text-emerald-400 font-medium shrink-0">✅ {qualityStats.translated}</span>
        <span className="shrink-0">⬜ {qualityStats.empty}</span>
        {qualityStats.tooLong > 0 && <span className="text-red-400 shrink-0">📏 تجاوز: {qualityStats.tooLong}</span>}
        {qualityStats.missingTags > 0 && <span className="text-amber-400 shrink-0">⚠️ رموز: {qualityStats.missingTags}</span>}
        <span className="shrink-0">🟢 ثقة عالية: {qualityStats.confidence.high}</span>
        <div className="mr-auto shrink-0 font-semibold">
          <span className={ENGINE_LABELS[es.translationEngine]?.color}>
            {ENGINE_LABELS[es.translationEngine]?.label}
          </span>
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto px-3 py-3">
        {pageEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Search className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">لا توجد نتائج مطابقة للفلاتر الحالية</p>
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => {
              es.setSearch(""); es.setFilterFile("all"); es.setFilterCategory("all");
              es.setFilterTechnical("all"); es.setCurrentPage(0);
            }}>
              إزالة الفلاتر
            </Button>
          </div>
        ) : (
          <div className="space-y-2 max-w-4xl mx-auto">
            {pageEntries.map((entry) => {
              const k = entryKey(entry);
              return (
                <EntryCard
                  key={k}
                  entry={entry}
                  translation={state.translations[k] || ""}
                  isProtected={(state.protectedEntries || new Set()).has(k)}
                  isBypass={(state.technicalBypass || new Set()).has(k)}
                  glossaryMap={es.glossaryMap}
                  onUpdate={es.updateTranslation}
                  onToggleProtect={es.toggleProtection}
                  onToggleBypass={es.toggleTechnicalBypass}
                  onGetAlternatives={es.handleGetAlternatives}
                />
              );
            })}
          </div>
        )}
      </main>

      {/* Pagination */}
      {totalPages > 1 && (
        <footer className="sticky bottom-0 border-t border-border/30 bg-background/95 backdrop-blur-sm px-3 py-2">
          <div className="flex items-center justify-between max-w-4xl mx-auto">
            <Button
              variant="outline" size="sm" className="h-8 gap-1 border-border/40"
              onClick={() => { es.setCurrentPage((p) => Math.max(0, p - 1)); window.scrollTo(0, 0); }}
              disabled={currentPage === 0}
            >
              <ChevronRight className="w-3.5 h-3.5" />
              السابق
            </Button>

            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                let page: number;
                if (totalPages <= 7) page = i;
                else if (currentPage < 4) page = i;
                else if (currentPage > totalPages - 4) page = totalPages - 7 + i;
                else page = currentPage - 3 + i;
                return (
                  <button
                    key={page}
                    onClick={() => { es.setCurrentPage(page); window.scrollTo(0, 0); }}
                    className={`w-7 h-7 rounded text-xs font-medium transition-colors ${
                      page === currentPage ? "bg-amber-500 text-black" : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {page + 1}
                  </button>
                );
              })}
            </div>

            <Button
              variant="outline" size="sm" className="h-8 gap-1 border-border/40"
              onClick={() => { es.setCurrentPage((p) => Math.min(totalPages - 1, p + 1)); window.scrollTo(0, 0); }}
              disabled={currentPage === totalPages - 1}
            >
              التالي
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div className="text-center text-xs text-muted-foreground mt-1">
            صفحة {currentPage + 1} من {totalPages} ({PAGE_SIZE} إدخال/صفحة)
          </div>
        </footer>
      )}

      {/* ===== Settings Dialog ===== */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-lg bg-card border-border" dir="rtl">
          <DialogHeader>
            <DialogTitle>⚙️ إعدادات المحرر</DialogTitle>
            <DialogDescription>محرك الترجمة ومفاتيح API</DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="engine">
            <TabsList className="w-full">
              <TabsTrigger value="engine" className="flex-1">المحرك</TabsTrigger>
              <TabsTrigger value="keys" className="flex-1">المفاتيح</TabsTrigger>
            </TabsList>

            <TabsContent value="engine" className="space-y-3 mt-4">
              <div className="space-y-2">
                {(Object.entries(ENGINE_LABELS) as [string, { label: string; color: string; note: string }][]).map(([id, info]) => (
                  <button
                    key={id}
                    onClick={() => es.setTranslationEngine(id as Parameters<typeof es.setTranslationEngine>[0])}
                    className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors ${
                      es.translationEngine === id
                        ? "border-amber-500/50 bg-amber-500/10"
                        : "border-border/30 bg-card/30 hover:bg-card/60"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${es.translationEngine === id ? "bg-amber-400" : "bg-muted-foreground/30"}`} />
                      <span className={`font-medium ${info.color}`}>{info.label}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{info.note}</span>
                  </button>
                ))}
              </div>

              {es.translationEngine === "gemini" && (
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">موديل Gemini</label>
                  <Select value={es.geminiModel} onValueChange={(v) => es.setGeminiModel(v as Parameters<typeof es.setGeminiModel>[0])}>
                    <SelectTrigger className="bg-muted/30 border-border/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gemini-2.0-flash">Gemini 2.0 Flash (سريع)</SelectItem>
                      <SelectItem value="gemini-2.5-flash">Gemini 2.5 Flash (موصى)</SelectItem>
                      <SelectItem value="gemini-2.5-pro">Gemini 2.5 Pro (أقوى)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </TabsContent>

            <TabsContent value="keys" className="space-y-4 mt-4">
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">مفتاح Gemini API</label>
                <Input
                  type="password"
                  value={es.userGeminiKey}
                  onChange={(e) => es.setUserGeminiKey(e.target.value)}
                  placeholder="AIza..."
                  className="bg-muted/30 border-border/30 font-mono text-sm"
                  dir="ltr"
                />
                <p className="text-xs text-muted-foreground">من <a href="https://aistudio.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">aistudio.google.com</a></p>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">مفتاح Claude API</label>
                <Input
                  type="password"
                  value={es.userClaudeKey}
                  onChange={(e) => es.setUserClaudeKey(e.target.value)}
                  placeholder="sk-ant-..."
                  className="bg-muted/30 border-border/30 font-mono text-sm"
                  dir="ltr"
                />
                <p className="text-xs text-muted-foreground">من <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">console.anthropic.com</a></p>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">إيميل MyMemory (اختياري - لرفع الحد)</label>
                <Input
                  type="email"
                  value={es.myMemoryEmail}
                  onChange={(e) => es.setMyMemoryEmail(e.target.value)}
                  placeholder="example@email.com"
                  className="bg-muted/30 border-border/30 text-sm"
                  dir="ltr"
                />
              </div>

              <p className="text-xs text-muted-foreground p-2 bg-muted/20 rounded-lg">
                🔒 المفاتيح تُحفظ فقط في متصفحك (localStorage) ولا تُرسل لأي خادم.
              </p>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* ===== Glossary Dialog ===== */}
      <Dialog open={showGlossary} onOpenChange={setShowGlossary}>
        <DialogContent className="max-w-lg bg-card border-border" dir="rtl">
          <DialogHeader>
            <DialogTitle>📚 المسرد</DialogTitle>
            <DialogDescription>مصطلحات تُطبَّق تلقائياً على الترجمة. صيغة: المصطلح الإنجليزي → الترجمة العربية</DialogDescription>
          </DialogHeader>
          <Textarea
            value={es.glossaryText}
            onChange={(e) => es.saveGlossary(e.target.value)}
            placeholder="Hyrule → هايرول&#10;Link → لينك&#10;Shrine → ضريح&#10;..."
            dir="ltr"
            rows={12}
            className="font-mono text-sm bg-muted/30 border-border/30 resize-none"
          />
          <p className="text-xs text-muted-foreground">
            {es.glossaryMap.size} مصطلح محمّل — يُستخدم في مقارنة الترجمة وإرشادات AI
          </p>
        </DialogContent>
      </Dialog>

      {/* ===== Fix Tools Dialog ===== */}
      <Dialog open={showFixTools} onOpenChange={setShowFixTools}>
        <DialogContent className="max-w-md bg-card border-border" dir="rtl">
          <DialogHeader>
            <DialogTitle>🔧 أدوات الإصلاح التلقائي</DialogTitle>
            <DialogDescription>تطبّق على جميع الترجمات الموجودة</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-2">
            {[
              { label: "🔡 إصلاح الأحرف العالقة", desc: "أحرف متكررة وزيرو-ويدث", fn: () => { es.handleFixAllStuck(); setShowFixTools(false); } },
              { label: "؟ إصلاح علامات الترقيم", desc: "? → ؟  ,  → ،  ; → ؛", fn: () => { es.handleFixAllPunctuation(); setShowFixTools(false); } },
              { label: "[] إصلاح الأقواس", desc: "أقواس غير متوازنة ورموز مفقودة", fn: () => { es.handleFixAllBrackets(); setShowFixTools(false); } },
              { label: "ً إصلاح التشكيل", desc: "حذف تشكيل خاطئ ومتراكم", fn: () => { es.handleFixAllDiacritics(); setShowFixTools(false); } },
              { label: "   إصلاح المسافات", desc: "حذف مسافات مزدوجة وزائدة", fn: () => { es.handleFixAllSpaces(); setShowFixTools(false); } },
              { label: "أإء إصلاح الهمزات", desc: "تصحيح أخطاء الهمزة الشائعة", fn: () => { es.handleFixAllHamza(); setShowFixTools(false); } },
              { label: "ل إصلاح اللام المنفردة", desc: "ل → لا عند الخطأ", fn: () => { es.handleFixAllLonelyLam(); setShowFixTools(false); } },
              { label: "ه→ة إصلاح التاء/الهاء", desc: "استبدال ه بة في الكلمات المناسبة", fn: () => { es.handleFixAllTaaHaa(); setShowFixTools(false); } },
              { label: "↔ إصلاح BiDi المعكوس", desc: "تصحيح الأحرف العربية المعكوسة", fn: () => { es.handleFixAllReversed(); setShowFixTools(false); } },
              { label: "🏷 استعادة الرموز التقنية", desc: "إضافة رموز مفقودة من النص الأصلي", fn: () => { es.handleRestoreAllTags(); setShowFixTools(false); } },
            ].map((tool) => (
              <button
                key={tool.label}
                onClick={tool.fn}
                className="flex items-start gap-3 p-3 rounded-lg border border-border/30 bg-card/30 hover:bg-card/60 transition-colors text-right"
              >
                <div className="flex-1">
                  <div className="font-medium text-sm">{tool.label}</div>
                  <div className="text-xs text-muted-foreground">{tool.desc}</div>
                </div>
                <ChevronLeft className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== AI Review Dialog ===== */}
      <Dialog open={showReviewDialog || es.showReview} onOpenChange={(v) => { setShowReviewDialog(v); es.setShowReview(v); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-card border-border" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="w-5 h-5 text-amber-400" />
              مراجعة AI الذكية
            </DialogTitle>
            <DialogDescription>
              {es.reviewing ? "جارٍ مراجعة الترجمات بالذكاء الاصطناعي..." : `تم العثور على ${es.reviewFindings.length} ملاحظة`}
            </DialogDescription>
          </DialogHeader>

          {es.reviewing && (
            <div className="flex items-center justify-center py-8 gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
              <span className="text-muted-foreground">جارٍ مراجعة الترجمات...</span>
            </div>
          )}

          {!es.reviewing && es.reviewFindings.length === 0 && (
            <div className="text-center py-8">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
              <p className="font-semibold text-emerald-300">الترجمات تبدو ممتازة!</p>
              <p className="text-sm text-muted-foreground mt-1">لم يعثر الذكاء الاصطناعي على مشاكل تستحق التصحيح</p>
            </div>
          )}

          <div className="space-y-3">
            {es.reviewFindings.map((finding, i) => (
              <div key={i} className={`rounded-lg border p-3 space-y-2 ${
                finding.type === "error" ? "border-red-500/30 bg-red-500/5" : "border-amber-500/30 bg-amber-500/5"
              }`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    {finding.type === "error"
                      ? <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      : <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    }
                    <div className="min-w-0">
                      <p className="text-xs font-mono text-muted-foreground mb-1 truncate">{finding.key}</p>
                      <p className="text-sm font-medium">{finding.issue}</p>
                      <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                        <div>
                          <span className="text-muted-foreground/60">الحالي: </span>
                          <span className="text-amber-300">{finding.current}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground/60">المقترح: </span>
                          <span className="text-emerald-300">{finding.fix}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="h-7 px-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs shrink-0"
                    onClick={() => es.applyReviewFix(finding.key, finding.fix)}
                  >
                    تطبيق
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {es.reviewFindings.length > 0 && !es.reviewing && (
            <div className="flex justify-between items-center pt-2 border-t border-border/20">
              <span className="text-xs text-muted-foreground">{es.reviewFindings.length} ملاحظة متبقية</span>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-500"
                onClick={() => {
                  for (const f of es.reviewFindings) es.applyReviewFix(f.key, f.fix);
                }}
              >
                <CheckCircle2 className="w-4 h-4 ml-2" />
                تطبيق الكل
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ===== Alternatives Dialog ===== */}
      {es.quickAlternatives && (
        <Dialog open={!!es.quickAlternatives} onOpenChange={() => es.setQuickAlternatives(null)}>
          <DialogContent className="max-w-md bg-card border-border" dir="rtl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-blue-400" />
                بدائل الترجمة
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {es.quickAlternatives.alternatives.map((alt, i) => (
                <div key={i} className="p-3 rounded-lg border border-border/30 bg-card/40 space-y-1">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs">{alt.style}</Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-xs"
                      onClick={() => {
                        if (es.quickAlternatives) {
                          es.updateTranslation(es.quickAlternatives.key, alt.text);
                          es.setQuickAlternatives(null);
                        }
                      }}
                    >
                      استخدام
                    </Button>
                  </div>
                  <p className="text-sm" dir="rtl">{alt.text}</p>
                  <p className="text-xs text-muted-foreground">{alt.reason}</p>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
