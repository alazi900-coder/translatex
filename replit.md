# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Build**: esbuild

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

### TranslateX — محرر الترجمة العربية المتقدم (artifacts/translatex)
- **Preview path**: `/translatex/`
- **Port**: 21704
- **Stack**: React 18 + Vite + TypeScript + Tailwind CSS + shadcn/ui + IndexedDB

### Workflow
1. Upload `.zs` / `.sarc` file → `/api/extract` → SARC+MSBT parsed
2. Edit translations in full editor
3. Export JSON / rebuild SARC via `/api/build`

### Pages
- `/` — Home (Zelda dark theme, hero, features)
- `/process` — Upload page (drag-drop, live logs, merge mode)
- `/editor` — Full translation editor

### Frontend Key Files
- `src/pages/Home.tsx` — Landing page
- `src/pages/Process.tsx` — File upload + extraction
- `src/pages/Editor.tsx` — Main editor (all dialogs)
- `src/components/editor/EntryCard.tsx` — Entry card (byte meter, confidence, back-translate)
- `src/hooks/useEditorState.ts` — All state management (816 lines)
- `src/lib/types.ts` — ExtractedEntry, EditorState, helpers
- `src/lib/arabic-processing.ts` — Reshape, BiDi, reverseBidi, removePresentation
- `src/lib/arabic-text-fixes.ts` — fixStuckChars, fixDiacritics, fixSpaces, fixHamza, fixLonelyLam, fixTaaMarbutaHaa
- `src/lib/fix-brackets.ts` — fixBrackets (balance + restore from original)
- `src/lib/confidence-score.ts` — calcConfidence, confidenceColor, confidenceLabel
- `src/lib/byte-utils.ts` — utf16leByteLength, byteStatus, bytePercentage
- `src/lib/idb-storage.ts` — IndexedDB wrapper (idbGet, idbSet, idbSetSync)

### Translation Engines (5)
1. **lovable** — GPT-4o Mini via Replit AI proxy (free, built-in)
2. **gemini** — Gemini 2.5 Flash/Pro (user API key)
3. **claude** — Claude Haiku (user API key)
4. **google** — Google Translate free API
5. **mymemory** — MyMemory free API

### Fix Tools (10)
1. إصلاح الأحرف العالقة (fixStuckChars)
2. إصلاح علامات الترقيم (? → ؟, , → ،)
3. إصلاح الأقواس (fixBrackets)
4. إصلاح التشكيل (fixDiacritics)
5. إصلاح المسافات (fixSpaces)
6. إصلاح الهمزات (fixHamza)
7. إصلاح اللام المنفردة (fixLonelyLam)
8. إصلاح التاء/الهاء (fixTaaMarbutaHaa)
9. إصلاح BiDi المعكوس (reverseBidi)
10. استعادة الرموز التقنية (restoreTagsLocally)

### AI Features
- Single translate (per entry button)
- Batch translate (all untranslated entries, SSE streaming)
- Smart review (AI quality review, SSE streaming, apply fixes)
- Quick alternatives (3 style variants per entry)

### Backend Key Files (artifacts/api-server)
- `src/routes/extract.ts` — SARC parser + MSBT parser + /api/extract + /api/build
- `src/routes/ai.ts` — 7 AI routes with Zelda glossary
- `src/routes/index.ts` — Route registration

### API Routes
- `POST /api/extract` — Upload .zs/.sarc → parse SARC → parse MSBT → return entries[]
- `POST /api/build` — Upload original + translations → rebuild MSBT+SARC → download .sarc
- `POST /api/ai/translate` — Single text translation
- `POST /api/ai/batch-translate` — Batch translation (SSE)
- `POST /api/ai/review` — Batch quality review
- `POST /api/ai/improve` — Suggest shorter/better translations
- `POST /api/ai/polish` — Arabic grammar correction
- `POST /api/ai/enhance` — Context-aware enhancement
- `POST /api/ai/alternatives` — 3 style variants
- `POST /api/ai/smart-review` — Streaming smart review (SSE)

### Data Flow
- Entries stored in IndexedDB (`translatex-arabize` DB, `kv` store, key `editorState`)
- Auto-save every 1500ms on translation change
- Flush on beforeunload/visibilitychange
- entryKey format: `"msbtFile:index"` (e.g. `"ActorMsg/Link.msbt:0"`)
- maxBytes = `max(utf16leByteLength(original) * 3, 64)`

### Notes
- SARC parser is pure TypeScript (no native deps except fzstd for decompression)
- fzstd installed in api-server for .zs decompression
- multer installed in api-server for file uploads
- Build route returns .sarc (not .zs — fzstd is decompress-only)
- API_BASE computed as: `BASE_URL.replace(/\/[^/]*$/, "") + "/api"`
