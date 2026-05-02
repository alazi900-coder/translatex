import { Router } from "express";
import multer from "multer";
import { decompress } from "fzstd";
import * as zstdWasm from "@bokuweb/zstd-wasm";

let wasmReady: Promise<void> | null = null;
function ensureWasm(): Promise<void> {
  if (!wasmReady) wasmReady = zstdWasm.init();
  return wasmReady;
}

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

interface SarcFile { name: string; data: Uint8Array; }

function parseSARC(data: Uint8Array): SarcFile[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const magic = String.fromCharCode(...data.slice(0, 4));
  if (magic !== "SARC") throw new Error("Not a valid SARC archive");

  const headerSize = view.getUint16(4, true);
  const dataOffset = view.getUint32(0x0c, true);
  const sfatOffset = headerSize;
  const sfatMagic = String.fromCharCode(...data.slice(sfatOffset, sfatOffset + 4));
  if (sfatMagic !== "SFAT") throw new Error("Missing SFAT section");

  const nodeCount = view.getUint16(sfatOffset + 6, true);
  const sfntOffset = sfatOffset + 12 + nodeCount * 16;
  const files: SarcFile[] = [];

  for (let i = 0; i < nodeCount; i++) {
    const nodeOffset = sfatOffset + 12 + i * 16;
    const nameOffset = (view.getUint32(nodeOffset + 4, true) & 0x00ffffff) * 4;
    const fileDataStart = view.getUint32(nodeOffset + 8, true);
    const fileDataEnd = view.getUint32(nodeOffset + 12, true);

    let name = "";
    let p = sfntOffset + 8 + nameOffset;
    while (p < data.length && data[p] !== 0) { name += String.fromCharCode(data[p]); p++; }

    files.push({ name, data: data.slice(dataOffset + fileDataStart, dataOffset + fileDataEnd) });
  }
  return files;
}

interface MsbtEntryParsed {
  label: string;
  originalText: string;
  offset: number;
  size: number;
  tagCount: number;
}

function parseMSBT(data: Uint8Array): MsbtEntryParsed[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const magic = String.fromCharCode(...data.slice(0, 8));
  if (!magic.startsWith("MsgStdBn")) throw new Error("Not a valid MSBT file");

  const entries: MsbtEntryParsed[] = [];
  const labelMap = new Map<number, string>();
  let pos = 0x20;

  while (pos < data.length - 16) {
    const sectionMagic = String.fromCharCode(...data.slice(pos, pos + 4));
    const sectionSize = view.getUint32(pos + 4, true);
    if (sectionMagic === "LBL1") {
      const lbl1Start = pos + 16;
      const numBuckets = view.getUint32(lbl1Start, true);
      for (let b = 0; b < numBuckets; b++) {
        const bucketLabelCount = view.getUint32(lbl1Start + 4 + b * 8, true);
        const bucketOffset = view.getUint32(lbl1Start + 4 + b * 8 + 4, true);
        let labelPos = lbl1Start + bucketOffset;
        for (let l = 0; l < bucketLabelCount; l++) {
          const labelLen = data[labelPos]; labelPos++;
          let labelName = "";
          for (let c = 0; c < labelLen; c++) labelName += String.fromCharCode(data[labelPos + c]);
          labelPos += labelLen;
          const itemIndex = view.getUint32(labelPos, true); labelPos += 4;
          labelMap.set(itemIndex, labelName);
        }
      }
      break;
    }
    pos += 16 + sectionSize;
    pos = (pos + 15) & ~15;
  }

  pos = 0x20;
  while (pos < data.length - 16) {
    const sectionMagic = String.fromCharCode(...data.slice(pos, pos + 4));
    const sectionSize = view.getUint32(pos + 4, true);
    if (sectionMagic === "TXT2") {
      const txt2Start = pos + 16;
      const entryCount = view.getUint32(txt2Start, true);
      for (let i = 0; i < entryCount; i++) {
        const entryOffset = view.getUint32(txt2Start + 4 + i * 4, true);
        const nextOffset = i < entryCount - 1 ? view.getUint32(txt2Start + 4 + (i + 1) * 4, true) : sectionSize;
        const absOffset = txt2Start + entryOffset;
        const textLength = nextOffset - entryOffset;

        const textParts: string[] = [];
        let tagCount = 0;
        for (let j = 0; j < textLength - 2; j += 2) {
          const charCode = view.getUint16(absOffset + j, true);
          if (charCode === 0) break;
          if (charCode === 0x0e) {
            const paramSize = view.getUint16(absOffset + j + 6, true);
            const markerCode = 0xe000 + tagCount;
            tagCount++;
            j += 6 + paramSize;
            textParts.push(String.fromCharCode(markerCode));
            continue;
          }
          textParts.push(String.fromCharCode(charCode));
        }
        const text = textParts.join("");
        entries.push({
          label: labelMap.get(i) || `entry_${i}`,
          originalText: text,
          offset: absOffset,
          size: textLength,
          tagCount,
        });
      }
      break;
    }
    pos += 16 + sectionSize;
    pos = (pos + 15) & ~15;
  }
  return entries;
}

function utf16leByteLength(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) { bytes += 4; i++; }
    else bytes += 2;
  }
  return bytes;
}

// ─── Zstandard with Nintendo dictionary support ──────────────────────────────

// Map filename suffix → dictionary name inside ZsDic.pack
const DICT_SUFFIX_MAP: [string, string][] = [
  [".sarc.zs",      "sarc.zsdic"],
  [".pack.zs",      "pack.zsdic"],
  [".byml.zs",      "bcett.byml.zsdic"],
  [".bphysics.zs",  "bphysics.zsdic"],
  [".bgyml.zs",     "bgyml.zsdic"],
  [".baatarc.zs",   "baatarc.zsdic"],
  [".bars.zs",      "bars.zsdic"],
];

function pickDictName(filename: string): string {
  for (const [suffix, dictName] of DICT_SUFFIX_MAP) {
    if (filename.endsWith(suffix)) return dictName;
  }
  return "zs.zsdic";
}

async function extractZsDics(dictFileBuffer: Buffer): Promise<Map<string, Buffer>> {
  // ZsDic.pack.zs is itself a plain zstd stream (no dict) containing a SARC
  let raw: Uint8Array;
  try {
    raw = decompress(new Uint8Array(dictFileBuffer));
  } catch {
    raw = new Uint8Array(dictFileBuffer);
  }
  const sarcFiles = parseSARC(raw);
  const map = new Map<string, Buffer>();
  for (const f of sarcFiles) {
    const name = f.name.split("/").pop() ?? f.name;
    map.set(name, Buffer.from(f.data));
  }
  return map;
}

async function decompressZs(
  data: Buffer,
  filename: string,
  dicts: Map<string, Buffer> | null,
  logs: string[],
): Promise<Buffer> {
  // 1. Try with Nintendo dictionary using WASM zstd
  if (dicts && dicts.size > 0) {
    const dictName = pickDictName(filename);
    const dict = dicts.get(dictName) ?? dicts.get("zs.zsdic");
    if (dict) {
      try {
        await ensureWasm();
        const dctx = zstdWasm.createDCtx();
        try {
          const capacity = Math.max(data.length * 20, 4 * 1024 * 1024);
          const result = zstdWasm.decompressUsingDict(dctx, new Uint8Array(data), new Uint8Array(dict), { defaultHeapSize: capacity });
          logs.push(`✅ فك الضغط بالقاموس (${dictName}): ${result.length.toLocaleString()} بايت`);
          return Buffer.from(result);
        } finally {
          zstdWasm.freeDCtx(dctx);
        }
      } catch (e) {
        logs.push(`⚠️ فشل القاموس ${dictName}: ${e}، محاولة بدون قاموس...`);
      }
    }
  }
  // 2. Fallback: plain zstd (fzstd — works for non-dict compressed files)
  try {
    const result = decompress(new Uint8Array(data));
    logs.push(`✅ فك الضغط بدون قاموس: ${result.length.toLocaleString()} بايت`);
    return Buffer.from(result);
  } catch (e) {
    logs.push(`⚠️ فشل فك الضغط العادي: ${e}`);
  }
  // 3. Last resort: return as-is (maybe uncompressed SARC)
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────

router.post("/extract", upload.fields([
  { name: "langFile", maxCount: 1 },
  { name: "dictFile", maxCount: 1 },
]), async (req, res) => {
  try {
    const files = req.files as Record<string, Express.Multer.File[]>;
    const langFile = files?.langFile?.[0];
    if (!langFile) {
      res.status(400).json({ error: "langFile مطلوب" });
      return;
    }

    const logs: string[] = [];
    logs.push(`📂 استلام الملف: ${langFile.originalname} (${langFile.size.toLocaleString()} بايت)`);

    // Load dictionaries from ZsDic.pack.zs if provided
    let dicts: Map<string, Buffer> | null = null;
    const dictFileRaw = files?.dictFile?.[0];
    if (dictFileRaw) {
      logs.push(`📖 تحميل قاموس Zstandard: ${dictFileRaw.originalname}...`);
      try {
        dicts = await extractZsDics(dictFileRaw.buffer);
        logs.push(`✅ القاموس يحتوي على ${dicts.size} ملف: ${[...dicts.keys()].join(", ")}`);
      } catch (e) {
        logs.push(`⚠️ فشل تحميل القاموس: ${e}`);
      }
    }

    let rawData: Buffer = langFile.buffer;

    // Decompress if .zs (ZStandard compressed)
    if (langFile.originalname.endsWith(".zs") || langFile.originalname.endsWith(".zstd")) {
      logs.push("🗜️ فك ضغط ZStandard...");
      rawData = await decompressZs(rawData, langFile.originalname, dicts, logs);
    }

    const rawUint8 = new Uint8Array(rawData.buffer, rawData.byteOffset, rawData.byteLength);

    // Parse SARC
    logs.push("📦 قراءة أرشيف SARC...");
    let sarcFiles: SarcFile[];
    try {
      sarcFiles = parseSARC(rawUint8);
      logs.push(`✅ عدد الملفات في SARC: ${sarcFiles.length}`);
    } catch (e) {
      res.status(400).json({ error: `خطأ في قراءة SARC: ${e}`, logs });
      return;
    }

    // Extract MSBT entries
    const msbtFiles = sarcFiles.filter((f) => f.name.endsWith(".msbt"));
    logs.push(`📝 ملفات MSBT: ${msbtFiles.length}`);

    interface ExtractedEntry {
      msbtFile: string;
      index: number;
      label: string;
      original: string;
      maxBytes: number;
    }

    const allEntries: ExtractedEntry[] = [];
    let skipped = 0;

    for (const msbt of msbtFiles) {
      try {
        const parsed = parseMSBT(msbt.data);
        for (let i = 0; i < parsed.length; i++) {
          const entry = parsed[i];
          const original = entry.originalText;
          // Skip purely empty entries
          if (!original || original.replace(/[\uE000-\uE0FF]/g, "").trim() === "") {
            skipped++;
            continue;
          }
          const maxBytes = Math.max(utf16leByteLength(original) * 3, 64);
          allEntries.push({
            msbtFile: msbt.name,
            index: i,
            label: entry.label,
            original,
            maxBytes,
          });
        }
        logs.push(`  ✅ ${msbt.name}: ${parsed.length} إدخال`);
      } catch (e) {
        logs.push(`  ⚠️ ${msbt.name}: خطأ في القراءة — ${e}`);
      }
    }

    logs.push(`✨ المجموع: ${allEntries.length} إدخال (تخطي ${skipped} فارغ)`);

    const stats = {
      totalFiles: sarcFiles.length,
      msbtFiles: msbtFiles.length,
      totalEntries: allEntries.length,
      skipped,
      langFileName: langFile.originalname,
    };

    res.json({ entries: allEntries, stats, logs });
  } catch (err) {
    req.log?.error({ err }, "Extract error");
    res.status(500).json({ error: `خطأ في الاستخراج: ${err instanceof Error ? err.message : String(err)}` });
  }
});

router.post("/build", upload.fields([
  { name: "langFile", maxCount: 1 },
  { name: "dictFile", maxCount: 1 },
]), async (req, res) => {
  try {
    const files = req.files as Record<string, Express.Multer.File[]>;
    const langFile = files?.langFile?.[0];
    if (!langFile) {
      res.status(400).json({ error: "langFile مطلوب" });
      return;
    }

    const translationsRaw = req.body?.translations;
    if (!translationsRaw) {
      res.status(400).json({ error: "translations مطلوبة" });
      return;
    }

    const translations: Record<string, string> = typeof translationsRaw === "string"
      ? JSON.parse(translationsRaw)
      : translationsRaw;

    // Load dictionaries if provided
    let dicts: Map<string, Buffer> | null = null;
    const dictFileRaw = files?.dictFile?.[0];
    if (dictFileRaw) {
      try { dicts = await extractZsDics(dictFileRaw.buffer); } catch { /* ignore */ }
    }

    const wasCompressed = langFile.originalname.endsWith(".zs") || langFile.originalname.endsWith(".zstd");
    let rawBuf: Buffer = langFile.buffer;

    if (wasCompressed) {
      const buildLogs: string[] = [];
      rawBuf = await decompressZs(rawBuf, langFile.originalname, dicts, buildLogs);
    }

    let rawData: Uint8Array = new Uint8Array(rawBuf.buffer, rawBuf.byteOffset, rawBuf.byteLength);

    // Parse SARC
    let sarcFiles: SarcFile[];
    try {
      sarcFiles = parseSARC(rawData);
    } catch (e) {
      res.status(400).json({ error: `خطأ في قراءة SARC: ${e}` });
      return;
    }

    interface TagInfo { markerCode: number; bytes: Uint8Array; }
    interface MsbtEntryFull {
      label: string;
      originalText: string;
      processedText: string;
      offset: number;
      size: number;
      tags: TagInfo[];
    }

    function parseMSBTFull(data: Uint8Array): { entries: MsbtEntryFull[]; raw: Uint8Array } {
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      const entries: MsbtEntryFull[] = [];
      const labelMap = new Map<number, string>();
      let pos = 0x20;

      while (pos < data.length - 16) {
        const sectionMagic = String.fromCharCode(...data.slice(pos, pos + 4));
        const sectionSize = view.getUint32(pos + 4, true);
        if (sectionMagic === "LBL1") {
          const lbl1Start = pos + 16;
          const numBuckets = view.getUint32(lbl1Start, true);
          for (let b = 0; b < numBuckets; b++) {
            const bucketLabelCount = view.getUint32(lbl1Start + 4 + b * 8, true);
            const bucketOffset = view.getUint32(lbl1Start + 4 + b * 8 + 4, true);
            let labelPos = lbl1Start + bucketOffset;
            for (let l = 0; l < bucketLabelCount; l++) {
              const labelLen = data[labelPos]; labelPos++;
              let labelName = "";
              for (let c = 0; c < labelLen; c++) labelName += String.fromCharCode(data[labelPos + c]);
              labelPos += labelLen;
              const itemIndex = view.getUint32(labelPos, true); labelPos += 4;
              labelMap.set(itemIndex, labelName);
            }
          }
          break;
        }
        pos += 16 + sectionSize;
        pos = (pos + 15) & ~15;
      }

      pos = 0x20;
      while (pos < data.length - 16) {
        const sectionMagic = String.fromCharCode(...data.slice(pos, pos + 4));
        const sectionSize = view.getUint32(pos + 4, true);
        if (sectionMagic === "TXT2") {
          const txt2Start = pos + 16;
          const entryCount = view.getUint32(txt2Start, true);
          for (let i = 0; i < entryCount; i++) {
            const entryOffset = view.getUint32(txt2Start + 4 + i * 4, true);
            const nextOffset = i < entryCount - 1 ? view.getUint32(txt2Start + 4 + (i + 1) * 4, true) : sectionSize;
            const absOffset = txt2Start + entryOffset;
            const textLength = nextOffset - entryOffset;
            const textParts: string[] = [];
            const tags: TagInfo[] = [];
            for (let j = 0; j < textLength - 2; j += 2) {
              const charCode = view.getUint16(absOffset + j, true);
              if (charCode === 0) break;
              if (charCode === 0x0e) {
                const paramSize = view.getUint16(absOffset + j + 6, true);
                const totalTagBytes = 8 + paramSize;
                const markerCode = 0xe000 + tags.length;
                const tagBytes = data.slice(absOffset + j, absOffset + j + totalTagBytes);
                tags.push({ markerCode, bytes: tagBytes });
                j += 6 + paramSize;
                textParts.push(String.fromCharCode(markerCode));
                continue;
              }
              textParts.push(String.fromCharCode(charCode));
            }
            entries.push({
              label: labelMap.get(i) || `entry_${i}`,
              originalText: textParts.join(""),
              processedText: textParts.join(""),
              offset: absOffset,
              size: textLength,
              tags,
            });
          }
          break;
        }
        pos += 16 + sectionSize;
        pos = (pos + 15) & ~15;
      }
      return { entries, raw: data };
    }

    function encodeEntryToBytes(entry: MsbtEntryFull): Uint8Array {
      const tagMap = new Map<number, Uint8Array>();
      for (const tag of entry.tags) tagMap.set(tag.markerCode, tag.bytes);
      const parts: number[] = [];
      for (let i = 0; i < entry.processedText.length; i++) {
        const code = entry.processedText.charCodeAt(i);
        const tagBytes = tagMap.get(code);
        if (tagBytes) { for (const b of tagBytes) parts.push(b); }
        else { parts.push(code & 0xff); parts.push((code >> 8) & 0xff); }
      }
      parts.push(0, 0);
      return new Uint8Array(parts);
    }

    function rebuildMSBT(data: Uint8Array, entries: MsbtEntryFull[]): Uint8Array {
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      const sections: { magic: string; data: Uint8Array; size: number }[] = [];
      let pos = 0x20;
      while (pos < data.length - 16) {
        const magic = String.fromCharCode(...data.slice(pos, pos + 4));
        const sectionSize = view.getUint32(pos + 4, true);
        if (sectionSize === 0 && magic === "\0\0\0\0") break;
        sections.push({ magic, data: data.slice(pos + 16, pos + 16 + sectionSize), size: sectionSize });
        pos += 16 + sectionSize;
        pos = (pos + 15) & ~15;
      }

      const txt2Idx = sections.findIndex((s) => s.magic === "TXT2");
      if (txt2Idx < 0) return data;

      const txt2Section = sections[txt2Idx];
      const txt2View = new DataView(txt2Section.data.buffer, txt2Section.data.byteOffset, txt2Section.data.byteLength);
      const entryCount = txt2View.getUint32(0, true);
      const encodedEntries = entries.map((e) => encodeEntryToBytes(e));
      const offsetTableSize = 4 + entryCount * 4;
      let dataSize = 0;
      for (const enc of encodedEntries) dataSize += enc.length;
      const txt2ContentSize = offsetTableSize + dataSize;
      const newTxt2Content = new Uint8Array(txt2ContentSize);
      const txt2ContentView = new DataView(newTxt2Content.buffer);
      txt2ContentView.setUint32(0, entryCount, true);
      let currentOffset = offsetTableSize;
      for (let i = 0; i < encodedEntries.length; i++) {
        txt2ContentView.setUint32(4 + i * 4, currentOffset, true);
        newTxt2Content.set(encodedEntries[i], currentOffset);
        currentOffset += encodedEntries[i].length;
      }

      const sectionBuffers: Uint8Array[] = [];
      let totalContentSize = 0;
      for (const section of sections) {
        const sectionHeader = new Uint8Array(16);
        const shView = new DataView(sectionHeader.buffer);
        for (let i = 0; i < 4; i++) sectionHeader[i] = section.magic.charCodeAt(i);
        let content: Uint8Array;
        if (section.magic === "TXT2") { content = newTxt2Content; shView.setUint32(4, txt2ContentSize, true); }
        else { content = section.data; shView.setUint32(4, section.size, true); }
        const fullSection = new Uint8Array(16 + content.length);
        fullSection.set(sectionHeader);
        fullSection.set(content, 16);
        const aligned = (fullSection.length + 15) & ~15;
        const padded = new Uint8Array(aligned);
        padded.set(fullSection);
        for (let i = fullSection.length; i < aligned; i++) padded[i] = 0xab;
        sectionBuffers.push(padded);
        totalContentSize += padded.length;
      }

      const msbtHeader = new Uint8Array(0x20);
      msbtHeader.set(data.slice(0, 0x20));
      const fileSize = 0x20 + totalContentSize;
      const headerView = new DataView(msbtHeader.buffer);
      headerView.setUint32(18, fileSize, true);
      const result = new Uint8Array(fileSize);
      result.set(msbtHeader);
      let writePos = 0x20;
      for (const buf of sectionBuffers) { result.set(buf, writePos); writePos += buf.length; }
      return result;
    }

    function rebuildSARC(files: SarcFile[], originalData: Uint8Array): Uint8Array {
      const origView = new DataView(originalData.buffer, originalData.byteOffset, originalData.byteLength);
      const headerSize = origView.getUint16(4, true);
      const origDataOffset = origView.getUint32(0x0c, true);
      const sfatOffset = headerSize;
      const nodeCount = origView.getUint16(sfatOffset + 6, true);
      const hashMultiplier = origView.getUint32(sfatOffset + 8, true);
      const sfntOffset = sfatOffset + 12 + nodeCount * 16;

      function calcHash(name: string): number {
        let hash = 0;
        for (let i = 0; i < name.length; i++) hash = ((hash * hashMultiplier + name.charCodeAt(i)) & 0xffffffff) >>> 0;
        return hash;
      }

      const sfntBytes: number[] = [];
      const nameToOffset = new Map<string, number>();
      for (const file of files) {
        nameToOffset.set(file.name, sfntBytes.length);
        for (let i = 0; i < file.name.length; i++) sfntBytes.push(file.name.charCodeAt(i));
        sfntBytes.push(0);
        while (sfntBytes.length % 4 !== 0) sfntBytes.push(0);
      }

      const dataAlignment = 8;
      const fileDataParts: { data: Uint8Array; start: number }[] = [];
      let dataPos = 0;
      for (const file of files) {
        while (dataPos % dataAlignment !== 0) dataPos++;
        fileDataParts.push({ data: file.data, start: dataPos });
        dataPos += file.data.length;
      }

      const sfntHeaderSize = 8;
      const sfntSize = sfntHeaderSize + sfntBytes.length;
      const sfatSize = 12 + nodeCount * 16;
      const newHeaderSize = 0x14;
      const newDataOffset = ((newHeaderSize + sfatSize + sfntSize) + 0xff) & ~0xff;

      const totalSize = newDataOffset + dataPos;
      const outBuf = new Uint8Array(totalSize);
      const outView = new DataView(outBuf.buffer);

      outBuf[0] = 0x53; outBuf[1] = 0x41; outBuf[2] = 0x52; outBuf[3] = 0x43;
      outView.setUint16(4, newHeaderSize, true);
      outView.setUint16(6, 0xfeff, true);
      outView.setUint32(8, totalSize, true);
      outView.setUint32(0x0c, newDataOffset, true);
      outView.setUint16(0x10, origView.getUint16(0x10, true), true);
      outView.setUint16(0x12, 0, true);

      outBuf[sfatOffset] = 0x53; outBuf[sfatOffset + 1] = 0x46; outBuf[sfatOffset + 2] = 0x41; outBuf[sfatOffset + 3] = 0x54;
      outView.setUint16(sfatOffset + 4, 0x000c, true);
      outView.setUint16(sfatOffset + 6, nodeCount, true);
      outView.setUint32(sfatOffset + 8, hashMultiplier, true);

      const sortedFiles = [...files].sort((a, b) => calcHash(a.name) - calcHash(b.name));
      for (let i = 0; i < sortedFiles.length; i++) {
        const f = sortedFiles[i];
        const nodeOffset = sfatOffset + 12 + i * 16;
        const fp = fileDataParts.find((p) => {
          const origIdx = files.findIndex((fi) => fi.name === f.name);
          return fileDataParts[origIdx] === p;
        }) || fileDataParts[files.findIndex((fi) => fi.name === f.name)];
        const nameOff = nameToOffset.get(f.name) || 0;
        outView.setUint32(nodeOffset, calcHash(f.name), true);
        outView.setUint32(nodeOffset + 4, (nameOff / 4) | 0x01000000, true);
        outView.setUint32(nodeOffset + 8, fp.start, true);
        outView.setUint32(nodeOffset + 12, fp.start + f.data.length, true);
      }

      outBuf[sfntOffset] = 0x53; outBuf[sfntOffset + 1] = 0x46; outBuf[sfntOffset + 2] = 0x4e; outBuf[sfntOffset + 3] = 0x54;
      outView.setUint16(sfntOffset + 4, 0x0008, true);
      outView.setUint32(sfntOffset + 6, sfntBytes.length, true);
      for (let i = 0; i < sfntBytes.length; i++) outBuf[sfntOffset + sfntHeaderSize + i] = sfntBytes[i];

      for (let i = 0; i < files.length; i++) {
        const fp = fileDataParts[i];
        outBuf.set(files[i].data, newDataOffset + fp.start);
      }

      return outBuf;
    }

    // Apply translations to SARC
    const modifiedFiles = sarcFiles.map((file) => {
      if (!file.name.endsWith(".msbt")) return file;
      try {
        const { entries } = parseMSBTFull(file.data);
        let modified = false;
        for (let i = 0; i < entries.length; i++) {
          const key = `${file.name}:${i}`;
          if (translations[key] !== undefined && translations[key] !== "") {
            entries[i].processedText = translations[key];
            modified = true;
          }
        }
        if (!modified) return file;
        return { name: file.name, data: rebuildMSBT(file.data, entries) };
      } catch { return file; }
    });

    const repackedSARC = rebuildSARC(modifiedFiles, rawData);

    const outputName = langFile.originalname.replace(/\.zs$/, ".sarc").replace(/\.zstd$/, ".sarc");
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${outputName}"`);
    res.setHeader("X-Applied-Count", String(Object.keys(translations).length));
    res.send(Buffer.from(repackedSARC));
  } catch (err) {
    req.log?.error({ err }, "Build error");
    res.status(500).json({ error: `خطأ في البناء: ${err instanceof Error ? err.message : String(err)}` });
  }
});

export default router;
