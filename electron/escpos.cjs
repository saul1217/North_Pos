const COLS = 32;

const CP850 = {
  Á: 0xb5,
  É: 0x90,
  Í: 0xd6,
  Ó: 0xe0,
  Ú: 0xe9,
  á: 0xa0,
  é: 0x82,
  í: 0xa1,
  ó: 0xa2,
  ú: 0xa3,
  Ñ: 0xa5,
  ñ: 0xa4,
  Ü: 0x9a,
  ü: 0x81,
  "¡": 0xad,
  "¿": 0xa8,
  "°": 0xf8,
  "ª": 0xa6,
  º: 0xa7,
  "«": 0xae,
  "»": 0xaf,
};

function normalize(text) {
  return String(text ?? "")
    .replace(/[\u00A0\u202F]/g, " ")
    .replace(/[—–−]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\r/g, "");
}

function encodeCp850(text) {
  const cleaned = normalize(text);
  const out = Buffer.alloc(cleaned.length);
  for (let i = 0; i < cleaned.length; i += 1) {
    const ch = cleaned[i];
    const code = ch.charCodeAt(0);
    if (code <= 0x7f) out[i] = code;
    else out[i] = CP850[ch] ?? 0x3f;
  }
  return out;
}

function wrapLine(text, width) {
  const value = normalize(text).replace(/\s+/g, " ").trim();
  if (!value) return [""];
  if (value.length <= width) return [value];
  const words = value.split(" ");
  const rows = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      if (word.length <= width) {
        current = word;
      } else {
        for (let i = 0; i < word.length; i += width) {
          const slice = word.slice(i, i + width);
          if (slice.length === width) rows.push(slice);
          else current = slice;
        }
      }
      continue;
    }
    if (current.length + 1 + word.length <= width) {
      current += ` ${word}`;
    } else {
      rows.push(current);
      current = word.length <= width ? word : "";
      if (word.length > width) {
        for (let i = 0; i < word.length; i += width) {
          const slice = word.slice(i, i + width);
          if (slice.length === width) rows.push(slice);
          else current = slice;
        }
      }
    }
  }
  if (current) rows.push(current);
  return rows.length ? rows : [""];
}

function padBetween(left, right, width) {
  const l = normalize(left).replace(/\s+/g, " ").trim();
  const r = normalize(right).replace(/\s+/g, " ").trim();
  if (!l) return r.slice(0, width);
  if (!r) return l.slice(0, width);
  if (l.length + 1 + r.length > width) {
    const leftWidth = Math.max(8, width - r.length - 1);
    return `${l.slice(0, leftWidth)} ${r}`.slice(0, width);
  }
  return `${l}${" ".repeat(width - l.length - r.length)}${r}`;
}

function center(text, width) {
  const value = text.length > width ? text.slice(0, width) : text;
  const pad = Math.max(0, Math.floor((width - value.length) / 2));
  return `${" ".repeat(pad)}${value}`;
}

function rightAlign(text, width) {
  const value = text.length > width ? text.slice(0, width) : text;
  return value.padStart(width, " ");
}

function cmd(...bytes) {
  return Buffer.from(bytes);
}

/**
 * Convert Electron nativeImage.toBitmap() BGRA pixels to ESC/POS GS v 0 raster.
 * Dark pixels (luma < ~140) print as black (bit 1). MSB-first bits per row.
 */
function buildLogoRaster(bgraBuffer, width, height) {
  const w = Math.max(0, Math.floor(Number(width) || 0));
  const h = Math.max(0, Math.floor(Number(height) || 0));
  if (!Buffer.isBuffer(bgraBuffer) || w <= 0 || h <= 0) {
    return Buffer.alloc(0);
  }

  const widthBytes = Math.ceil(w / 8);
  const raster = Buffer.alloc(widthBytes * h);
  const threshold = 140;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const b = bgraBuffer[i] ?? 255;
      const g = bgraBuffer[i + 1] ?? 255;
      const r = bgraBuffer[i + 2] ?? 255;
      const a = bgraBuffer[i + 3] ?? 255;
      // Treat transparent / near-white as white (no ink)
      if (a < 128) continue;
      const luma = (r * 299 + g * 587 + b * 114) / 1000;
      if (luma >= threshold) continue;
      const byteIndex = y * widthBytes + (x >> 3);
      raster[byteIndex] |= 0x80 >> (x & 7);
    }
  }

  const xL = widthBytes & 0xff;
  const xH = (widthBytes >> 8) & 0xff;
  const yL = h & 0xff;
  const yH = (h >> 8) & 0xff;

  return Buffer.concat([
    cmd(0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH),
    raster,
  ]);
}

function buildEscPos(lines, options = {}) {
  const chunks = [
    cmd(0x1b, 0x40),
    cmd(0x1b, 0x74, 0x02),
    cmd(0x1b, 0x4d, 0x00),
    cmd(0x1b, 0x32),
  ];

  const logoRaster = options && Buffer.isBuffer(options.logoRaster) ? options.logoRaster : null;
  if (logoRaster && logoRaster.length > 0) {
    chunks.push(cmd(0x1b, 0x61, 0x01)); // center
    chunks.push(logoRaster);
    chunks.push(cmd(0x1b, 0x61, 0x00)); // left
    chunks.push(cmd(0x0a)); // blank line after logo
  }

  for (const raw of Array.isArray(lines) ? lines : []) {
    if (!raw || typeof raw !== "object") continue;
    if (raw.sep) {
      chunks.push(encodeCp850(`${"-".repeat(COLS)}\n`));
      continue;
    }

    let text = normalize(raw.text ?? "");
    if (!text) continue;

    const width = raw.double ? 16 : COLS;
    const padded = text.includes("\t");
    if (padded) {
      const [left, right = ""] = text.split("\t");
      text = padBetween(left, right, width);
    }

    chunks.push(cmd(0x1b, 0x61, 0x00));
    if (raw.double) chunks.push(cmd(0x1d, 0x21, 0x11));
    if (raw.bold) chunks.push(cmd(0x1b, 0x45, 0x01));

    const rows = (padded ? [text] : wrapLine(text, width)).map((row) => {
      if (raw.align === "center") return center(row, width);
      if (raw.align === "right") return rightAlign(row, width);
      return row;
    });
    for (const row of rows) chunks.push(encodeCp850(`${row}\n`));

    if (raw.bold) chunks.push(cmd(0x1b, 0x45, 0x00));
    if (raw.double) chunks.push(cmd(0x1d, 0x21, 0x00));
  }

  chunks.push(
    cmd(0x1b, 0x45, 0x00),
    cmd(0x1d, 0x21, 0x00),
    cmd(0x1b, 0x61, 0x00),
    cmd(0x0a),
    cmd(0x1b, 0x64, 0x05),
  );

  return Buffer.concat(chunks);
}

module.exports = { COLS, buildEscPos, buildLogoRaster };
