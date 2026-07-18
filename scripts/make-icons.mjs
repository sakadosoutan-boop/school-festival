// public/icon.svg のテントデザインをPNGへラスタライズする。
// iOS Safariは apple-touch-icon にSVGを使えず、ホーム画面アイコンが
// 真っ白になるため、PNGを同梱する。実行: node scripts/make-icons.mjs
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const GRADIENT = [
  { at: 0, color: [0xff, 0x4d, 0x8d] },
  { at: 0.55, color: [0xff, 0x8a, 0x3d] },
  { at: 1, color: [0x9b, 0x5d, 0xe5] },
];

function gradientAt(t) {
  for (let i = 1; i < GRADIENT.length; i += 1) {
    if (t <= GRADIENT[i].at) {
      const span = GRADIENT[i].at - GRADIENT[i - 1].at;
      const local = span === 0 ? 0 : (t - GRADIENT[i - 1].at) / span;
      return GRADIENT[i - 1].color.map((from, ch) => from + (GRADIENT[i].color[ch] - from) * local);
    }
  }
  return GRADIENT[GRADIENT.length - 1].color;
}

const WHITE = [255, 255, 255];
const DOOR = [0xff, 0xf1, 0xf6];
const YELLOW = [0xff, 0xd2, 0x3f];
const BLUE = [0x4c, 0xc9, 0xf0];

function inCircle(x, y, cx, cy, r) {
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

// icon.svg と同じ512座標系で1サンプルの色を返す。SVGの描画順の逆に判定する。
function sample(u, v, fu, fv) {
  // 旗のたま → 旗ざお → 窓 → 太陽 → 入口 → 本体 → ひさし → 背景
  if (inCircle(fu, fv, 256, 88, 18)) return YELLOW;
  if (inCircle(fu, fv, 256, Math.min(148, Math.max(104, fv)), 9)) return WHITE; // 両端が丸いポール
  if (fv >= 244 && fv <= 292 && ((fu >= 166 && fu <= 214) || (fu >= 298 && fu <= 346))) return BLUE;
  if (inCircle(fu, fv, 256, 186, 28)) return YELLOW;
  if (fu >= 192 && fu <= 320 && fv >= 276 && fv <= 400) return DOOR;
  if (fu >= 128 && fu <= 384 && fv >= 206 && fv <= 400) return WHITE;
  if (fv >= 126 && fv <= 202) {
    const inset = ((202 - fv) / 76) * 40;
    if (fu >= 112 + inset && fu <= 400 - inset) {
      const base = gradientAt((u + v) / 1024);
      return WHITE.map((channel, i) => channel * 0.94 + base[i] * 0.06);
    }
  }
  return gradientAt((u + v) / 1024);
}

function render(size, { rounded, fgScale }) {
  const rgba = Buffer.alloc(size * size * 4);
  const radius = 116; // 角丸半径（512座標系、icon.svgのrxと同じ）
  const samplesPerAxis = 3;
  const total = samplesPerAxis * samplesPerAxis;
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0, g = 0, b = 0, covered = 0;
      for (let sy = 0; sy < samplesPerAxis; sy += 1) {
        for (let sx = 0; sx < samplesPerAxis; sx += 1) {
          const u = ((px + (sx + 0.5) / samplesPerAxis) / size) * 512;
          const v = ((py + (sy + 0.5) / samplesPerAxis) / size) * 512;
          if (rounded) {
            const nx = Math.max(0, Math.max(radius - u, u - (512 - radius)));
            const ny = Math.max(0, Math.max(radius - v, v - (512 - radius)));
            if (nx > 0 && ny > 0 && nx * nx + ny * ny > radius * radius) continue; // 角丸の外は透明
          }
          const fu = 256 + (u - 256) / fgScale;
          const fv = 256 + (v - 256) / fgScale;
          const [cr, cg, cb] = sample(u, v, fu, fv);
          r += cr; g += cg; b += cb; covered += 1;
        }
      }
      const offset = (py * size + px) * 4;
      if (covered === 0) {
        rgba.writeUInt32BE(0, offset);
      } else {
        rgba[offset] = Math.round(r / covered);
        rgba[offset + 1] = Math.round(g / covered);
        rgba[offset + 2] = Math.round(b / covered);
        rgba[offset + 3] = Math.round((covered / total) * 255);
      }
    }
  }
  return encodePng(size, rgba);
}

mkdirSync(OUT_DIR, { recursive: true });
const targets = [
  ["apple-touch-icon.png", 180, { rounded: false, fgScale: 1 }],
  ["icon-192.png", 192, { rounded: true, fgScale: 1 }],
  ["icon-512.png", 512, { rounded: true, fgScale: 1 }],
  ["maskable-512.png", 512, { rounded: false, fgScale: 0.82 }],
];
for (const [name, size, options] of targets) {
  const png = render(size, options);
  writeFileSync(join(OUT_DIR, name), png);
  console.log(`${name}  ${size}x${size}  ${png.length} bytes`);
}
