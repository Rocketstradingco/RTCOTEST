const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DEBUG_FILE = path.join(__dirname, 'debug_dump.txt');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

function load(name, fallback) {
  const file = path.join(DATA_DIR, name);
  if (fs.existsSync(file)) {
    try { return JSON.parse(fs.readFileSync(file)); } catch { return fallback; }
  }
  return fallback;
}

const store = {
  items: load('items.json', {}),
  sellers: load('sellers.json', {}),
  claims: load('claims.json', []),
  settings: load('settings.json', { embedTitleSize: 16, buttonLayout: 'row', embedColor: '#2b2d31' })
};

function save() {
  fs.writeFileSync(path.join(DATA_DIR, 'items.json'), JSON.stringify(store.items, null, 2));
  fs.writeFileSync(path.join(DATA_DIR, 'sellers.json'), JSON.stringify(store.sellers, null, 2));
  fs.writeFileSync(path.join(DATA_DIR, 'claims.json'), JSON.stringify(store.claims, null, 2));
  fs.writeFileSync(path.join(DATA_DIR, 'settings.json'), JSON.stringify(store.settings, null, 2));
  writeDebugDump();
}

function writeDebugDump() {
  const dump = {
    items: store.items,
    sellers: store.sellers,
    claims: store.claims,
    settings: store.settings,
  };
  fs.writeFileSync(DEBUG_FILE, JSON.stringify(dump, null, 2));
}

save(); // ensure files and debug dump exist on startup

module.exports = { store, save, writeDebugDump, DATA_DIR };
