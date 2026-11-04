// Gera os ícones PNG do Track Eye sem dependência externa: fundo preto
// arredondado, olho branco e íris coral (#FF5C4D).
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'assets', 'icons');
mkdirSync(out, { recursive: true });

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x + 0.5, y + 0.5, size);
      const i = y * (size * 4 + 1) + 1 + x * 4;
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Antialias simples por amostragem 3x3.
const sample = (fn) => (x, y, s) => {
  const acc = [0, 0, 0, 0];
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const p = fn(x + i / 3, y + j / 3, s);
    for (let k = 0; k < 4; k++) acc[k] += p[k] / 9;
  }
  return acc.map(Math.round);
};

const pixel = sample((x, y, s) => {
  const u = x / s, v = y / s;
  // fundo arredondado
  const r = 0.22;
  const cx = Math.min(Math.max(u, r), 1 - r), cy = Math.min(Math.max(v, r), 1 - r);
  if (Math.hypot(u - cx, v - cy) > r) return [0, 0, 0, 0];
  // olho: lente (interseção de dois círculos)
  const eyeW = 0.36, eyeH = 0.2;
  const dx = (u - 0.5) / eyeW, dy = (v - 0.5) / eyeH;
  const inEye = dx * dx + dy * dy <= 1;
  const iris = Math.hypot(u - 0.5, v - 0.5) <= 0.13;
  const pupil = Math.hypot(u - 0.5, v - 0.5) <= 0.06;
  if (pupil) return [10, 10, 10, 255];
  if (iris) return [255, 92, 77, 255];
  if (inEye) return [245, 244, 241, 255];
  return [10, 10, 10, 255];
});

for (const size of [16, 48, 128]) {
  writeFileSync(join(out, `icon-${size}.png`), png(size, pixel));
  console.log(`icon-${size}.png`);
}
