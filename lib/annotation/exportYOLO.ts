import type { AnnotateImage } from "../../types/annotate";

function labelFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  return base.replace(/\.[^.]+$/, ".txt");
}

function toYoloLines(img: AnnotateImage, classList: string[]): string {
  return img.regions
    .map((r) => {
      const clsIdx = classList.indexOf(r.cls ?? "");
      if (clsIdx < 0) return null;

      if (r.type === "box") {
        const xc = (r.x + r.w / 2).toFixed(6);
        const yc = (r.y + r.h / 2).toFixed(6);
        return `${clsIdx} ${xc} ${yc} ${r.w.toFixed(6)} ${r.h.toFixed(6)}`;
      }
      if (r.type === "polygon") {
        const pts = r.points
          .map(([px, py]) => `${px.toFixed(6)} ${py.toFixed(6)}`)
          .join(" ");
        return `${clsIdx} ${pts}`;
      }
      if (r.type === "point") {
        return `${clsIdx} ${r.x.toFixed(6)} ${r.y.toFixed(6)}`;
      }
      return null;
    })
    .filter(Boolean)
    .join("\n");
}

/**
/**
 * アノテーションラベル + classes.txt + dataset.yaml を ZIP にまとめてダウンロードする。
 * ライブラリ不要（ZIP バイナリを手動構築）
 */
export async function exportYOLOZip(
  images: AnnotateImage[],
  classList: string[]
): Promise<void> {
  const files: { name: string; data: Uint8Array }[] = [];
  const enc = new TextEncoder();

  // labels/
  for (const img of images) {
    files.push({
      name: `labels/${labelFileName(img.name)}`,
      data: enc.encode(toYoloLines(img, classList)),
    });
  }

  // classes.txt
  files.push({ name: "classes.txt", data: enc.encode(classList.join("\n")) });

  // dataset.yaml
  const yaml = [
    `nc: ${classList.length}`,
    `names: [${classList.map((c) => `'${c}'`).join(", ")}]`,
    `train: images/train`,
    `val: images/val`,
  ].join("\n");
  files.push({ name: "dataset.yaml", data: enc.encode(yaml) });

  const zipBytes = buildZip(files);
  downloadBlob(new Blob([zipBytes], { type: "application/zip" }), "annotations.zip");
}

// ─── ZIP バイナリ手動構築（ZIP specification: PKWARE APPNOTE.TXT） ───

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  const table = getCrcTable();
  for (const byte of data) {
    crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

let _crcTable: Uint32Array | null = null;
function getCrcTable(): Uint32Array {
  if (_crcTable) return _crcTable;
  _crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    _crcTable[n] = c;
  }
  return _crcTable;
}

function uint16le(n: number): Uint8Array {
  return new Uint8Array([n & 0xff, (n >> 8) & 0xff]);
}
function uint32le(n: number): Uint8Array {
  return new Uint8Array([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]);
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { out.set(a, offset); offset += a.length; }
  return out;
}

type LocalEntry = { header: Uint8Array; data: Uint8Array; offset: number; nameBytes: Uint8Array; crc: number; size: number };

function buildZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const locals: LocalEntry[] = [];
  let offset = 0;

  const parts: Uint8Array[] = [];

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const crc = crc32(f.data);
    const size = f.data.length;

    // Local file header
    const localHeader = concat(
      new Uint8Array([0x50, 0x4b, 0x03, 0x04]), // signature
      uint16le(20),     // version needed
      uint16le(0),      // general purpose bit flag
      uint16le(0),      // compression method (stored)
      uint16le(0),      // last mod time
      uint16le(0),      // last mod date
      uint32le(crc),
      uint32le(size),
      uint32le(size),
      uint16le(nameBytes.length),
      uint16le(0),      // extra field length
      nameBytes
    );

    locals.push({ header: localHeader, data: f.data, offset, nameBytes, crc, size });
    parts.push(localHeader, f.data);
    offset += localHeader.length + size;
  }

  const cdOffset = offset;

  // Central directory
  for (const e of locals) {
    const cdEntry = concat(
      new Uint8Array([0x50, 0x4b, 0x01, 0x02]), // signature
      uint16le(20),     // version made by
      uint16le(20),     // version needed
      uint16le(0),      // general purpose bit flag
      uint16le(0),      // compression method
      uint16le(0),      // last mod time
      uint16le(0),      // last mod date
      uint32le(e.crc),
      uint32le(e.size),
      uint32le(e.size),
      uint16le(e.nameBytes.length),
      uint16le(0),      // extra field length
      uint16le(0),      // file comment length
      uint16le(0),      // disk number start
      uint16le(0),      // internal attributes
      uint32le(0),      // external attributes
      uint32le(e.offset),
      e.nameBytes
    );
    parts.push(cdEntry);
    offset += cdEntry.length;
  }

  const cdSize = offset - cdOffset;

  // End of central directory record
  const eocd = concat(
    new Uint8Array([0x50, 0x4b, 0x05, 0x06]),
    uint16le(0),                   // disk number
    uint16le(0),                   // disk with start of CD
    uint16le(locals.length),
    uint16le(locals.length),
    uint32le(cdSize),
    uint32le(cdOffset),
    uint16le(0)                    // ZIP file comment length
  );
  parts.push(eocd);

  return concat(...parts);
}

function downloadText(content: string, filename: string): void {
  downloadBlob(new Blob([content], { type: "text/plain" }), filename);
}

function downloadBlob(blob: Blob, filename: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

