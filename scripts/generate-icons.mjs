import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const source = path.resolve('public/icons/icon.svg');
const outputDir = path.resolve('public/icons');
await mkdir(outputDir, { recursive: true });

const jobs = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
];

for (const job of jobs) {
  await sharp(source).resize(job.size, job.size).png().toFile(path.join(outputDir, job.file));
  console.log(`generated ${job.file}`);
}

// Maskable: icon diperkecil ke safe zone 72% di atas background penuh.
const mark = await sharp(source).resize(368, 368).png().toBuffer();
await sharp({
  create: {
    width: 512,
    height: 512,
    channels: 4,
    background: '#0b1326',
  },
})
  .composite([{ input: mark, top: 72, left: 72 }])
  .png()
  .toFile(path.join(outputDir, 'maskable-512.png'));
console.log('generated maskable-512.png');
