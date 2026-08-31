'use strict';
// Renders assets/og.svg to the PNG that link previews use. WhatsApp and most
// other apps will not read an SVG, so the shipped asset has to be a bitmap.
// Run it whenever the artwork changes:
//   node tools/make-og.js
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const src = path.join(__dirname, '..', 'assets', 'og.svg');
const out = path.join(__dirname, '..', 'public', 'og.png');

const svg = fs.readFileSync(src, 'utf8');
const png = new Resvg(svg, {
  fitTo: { mode: 'width', value: 1200 },
  font: { loadSystemFonts: true },
}).render().asPng();

fs.writeFileSync(out, png);
console.log('wrote ' + out + '  ' + Math.round(png.length / 1024) + ' KB');
