/**
 * Generate app icons from an SVG template.
 * Uses sharp to render PNGs at all required sizes + builds an ICO for Windows.
 *
 * Run: node scripts/generate-icons.mjs
 */
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'build-resources');

// ── ElevenLabs-inspired waveform icon ───────────────────────────────
// Rounded-square with warm-stone fill + five vertical bars representing
// an audio waveform. Primary blue (#137fec) bars, pill-shaped (round caps).
function makeSvg(size) {
  const pad = Math.round(size * 0.18);          // inner padding
  const inner = size - pad * 2;
  const barW = Math.max(2, Math.round(inner * 0.10));
  const gap = Math.round((inner - barW * 5) / 4);
  const cornerR = Math.round(size * 0.22);
  const barR = Math.max(1, Math.round(barW / 2));

  // Bar heights as fractions of inner height (center-anchored pattern).
  const heights = [0.35, 0.6, 1.0, 0.7, 0.45];
  const cx = size / 2;
  const cy = size / 2;

  const bars = heights.map((h, i) => {
    const barH = Math.round(inner * h);
    const x = pad + i * (barW + gap);
    const y = cy - barH / 2;
    return `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="${barR}" fill="#137fec"/>`;
  }).join('\n    ');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${cornerR}" fill="#f5f2ef"/>
  <rect x="1" y="1" width="${size - 2}" height="${size - 2}" rx="${cornerR - 1}" fill="#f5f2ef" stroke="rgba(0,0,0,0.06)" stroke-width="1"/>
    ${bars}
</svg>`;
}

// Tray icon: transparent bg, white bars (looks good on any taskbar).
function makeTrayIcon(size) {
  const pad = Math.round(size * 0.12);
  const inner = size - pad * 2;
  const barW = Math.max(2, Math.round(inner * 0.12));
  const gap = Math.round((inner - barW * 5) / 4);
  const barR = Math.max(1, Math.round(barW / 2));
  const heights = [0.35, 0.6, 1.0, 0.7, 0.45];
  const cy = size / 2;

  const bars = heights.map((h, i) => {
    const barH = Math.round(inner * h);
    const x = pad + i * (barW + gap);
    const y = cy - barH / 2;
    return `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="${barR}" fill="white"/>`;
  }).join('\n    ');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${bars}
</svg>`;
}

// ── Build ICO from multiple PNG buffers ────────────────────────────
// ICO format: ICONDIR header + ICONDIRENTRY per image + raw PNG data.
function buildIco(pngBuffers) {
  const count = pngBuffers.length;
  const headerSize = 6;
  const entrySize = 16;
  const dataOffset = headerSize + entrySize * count;

  // Header: reserved(2) + type=1(2) + count(2)
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const entries = [];
  const images = [];
  let offset = dataOffset;

  for (const { width, buffer } of pngBuffers) {
    const entry = Buffer.alloc(entrySize);
    entry.writeUInt8(width >= 256 ? 0 : width, 0);     // width (0 = 256)
    entry.writeUInt8(width >= 256 ? 0 : width, 1);     // height
    entry.writeUInt8(0, 2);                              // palette
    entry.writeUInt8(0, 3);                              // reserved
    entry.writeUInt16LE(1, 4);                           // planes
    entry.writeUInt16LE(32, 6);                          // bpp
    entry.writeUInt32LE(buffer.length, 8);               // size
    entry.writeUInt32LE(offset, 12);                     // offset
    entries.push(entry);
    images.push(buffer);
    offset += buffer.length;
  }

  return Buffer.concat([header, ...entries, ...images]);
}

// ── Main ───────────────────────────────────────────────────────────
async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  const pngEntries = [];

  for (const size of icoSizes) {
    const svg = makeSvg(size);
    const buf = await sharp(Buffer.from(svg)).png().toBuffer();
    pngEntries.push({ width: size, buffer: buf });
  }

  // Write ICO
  const ico = buildIco(pngEntries);
  fs.writeFileSync(path.join(OUT, 'icon.ico'), ico);
  console.log(`✓ icon.ico (${icoSizes.join(', ')} px)`);

  // Write standalone 512 PNG (used by some Linux DEs + macOS)
  const svg512 = makeSvg(512);
  await sharp(Buffer.from(svg512)).png().toFile(path.join(OUT, 'icon.png'));
  console.log('✓ icon.png (512 px)');

  // Tray icon 32×32
  const traySvg = makeTrayIcon(32);
  await sharp(Buffer.from(traySvg)).png().toFile(path.join(OUT, 'whisperall-tray.png'));
  console.log('✓ whisperall-tray.png (32 px)');

  console.log('Done — icons written to build-resources/');
}

main().catch((e) => { console.error(e); process.exit(1); });
