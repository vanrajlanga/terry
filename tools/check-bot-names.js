'use strict';
// Every bot in the pool needs an English and a Gujarati string, or a player
// would see a raw key like "bot.popatlal" on the table.
//   node tools/check-bot-names.js
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const srv = fs.readFileSync(path.join(root, 'server', 'index.js'), 'utf8');
const i18n = fs.readFileSync(path.join(root, 'public', 'i18n.js'), 'utf8');
const adminJs = fs.readFileSync(path.join(root, 'public', 'admin.js'), 'utf8');

const pool = [...srv.matchAll(/\{ key: '([a-z]+)', name: '([^']+)' \}/g)]
  .map((m) => ({ key: m[1], name: m[2] }));

const problems = [];
for (const bot of pool) {
  const hits = (i18n.match(new RegExp("'bot\\." + bot.key + "':", 'g')) || []).length;
  if (hits < 2) problems.push(bot.key + ': ' + hits + ' of 2 translations');
  if (i18n.indexOf("'bot." + bot.key + "': '" + bot.name + "'") === -1) {
    problems.push(bot.key + ': english string does not match the pool name');
  }
  if (adminJs.indexOf(bot.key + ':') === -1) {
    problems.push(bot.key + ': missing from the admin table lookup');
  }
}

console.log('bot pool: ' + pool.length + ' names');
console.log('  ' + pool.map((b) => b.name).join(', '));
if (problems.length) {
  console.error('PROBLEMS:');
  problems.forEach((p) => console.error('  - ' + p));
  process.exit(1);
}
console.log('every name has English + Gujarati, and the admin table knows them all');
