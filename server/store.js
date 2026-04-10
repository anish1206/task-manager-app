const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'tasks.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return [];
  }
}

function save(tasks) {
  fs.writeFileSync(FILE, JSON.stringify(tasks, null, 2), 'utf8');
}

module.exports = { load, save };
