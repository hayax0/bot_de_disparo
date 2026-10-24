// Fonte vetorial única; gera os tamanhos consumidos pelo site, e-mails e navegadores.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
async function main() {
  const svg = await fs.readFile(path.join(root, 'public/abordai-mark.svg'));
  const png = await sharp(svg).resize(512, 512).png().toBuffer();
  for (const name of ['logo-abordai-v1.png', 'logo.png', 'logo-v4.png', 'logo-bg.png', 'icon.png']) {
    await fs.writeFile(path.join(root, 'public', name), png);
  }
  for (const name of ['logo.svg', 'icon.svg']) await fs.writeFile(path.join(root, 'public', name), svg);
  await fs.writeFile(path.join(root, 'src/app/icon.png'), png);
  const sizes = [16, 32, 48, 64, 128, 256];
  const images = await Promise.all(sizes.map(size => sharp(svg).resize(size, size).png().toBuffer()));
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  images.forEach((image, i) => {
    const start = 6 + i * 16;
    header[start] = sizes[i] === 256 ? 0 : sizes[i];
    header[start + 1] = header[start];
    header.writeUInt16LE(1, start + 4);
    header.writeUInt16LE(32, start + 6);
    header.writeUInt32LE(image.length, start + 8);
    header.writeUInt32LE(offset, start + 12);
    offset += image.length;
  });
  const ico = Buffer.concat([header, ...images]);
  for (const name of ['public/favicon.ico', 'src/app/favicon.ico']) await fs.writeFile(path.join(root, name), ico);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
