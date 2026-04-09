// Run with: node generate-icons.js
// Generates simple placeholder PNG icons using canvas (Node.js with canvas package)
// If canvas is not available, use any 16x16, 48x48, 128x128 PNG files

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const sizes = [16, 48, 128];

sizes.forEach(size => {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#1a56db';
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, size * 0.15);
  ctx.fill();

  // Document icon
  ctx.fillStyle = 'white';
  const p = size * 0.15;
  const w = size * 0.55;
  const h = size * 0.65;
  const x = (size - w) / 2;
  const y = (size - h) / 2;
  ctx.fillRect(x, y, w, h);

  // Lines
  ctx.fillStyle = '#1a56db';
  const lx = x + size * 0.07;
  const lw = w - size * 0.14;
  const lineH = size * 0.06;
  const gap = size * 0.1;
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(lx, y + size * 0.15 + i * gap, lw * (i === 2 ? 0.7 : 1), lineH);
  }

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(__dirname, 'icons', `icon${size}.png`), buffer);
  console.log(`Generated icon${size}.png`);
});
