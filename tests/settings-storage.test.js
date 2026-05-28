const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');
const storageSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'storage.js'), 'utf8');

const storedSettings = {
  priority: {
    enabled: true,
    global: { incorrect: 4, timeSinceSeen: 1, learning: 1, slowResponse: 0 }
  }
};

const context = {
  console,
  document: {
    addEventListener() {}
  },
  localStorage: {
    getItem(key) {
      if (key === 'jq_settings') return JSON.stringify(storedSettings);
      return null;
    },
    setItem() {}
  },
  SAMPLE_DATA: []
};

vm.createContext(context);
vm.runInContext(
  `${mainSource}
${storageSource}
loadSettingsFromStorage();
this.loadedSettings = settings;`,
  context
);

assert.strictEqual(context.loadedSettings.priority.global.incorrect, 4);
assert.ok(context.loadedSettings.priority.perGame.quiz);
assert.ok(context.loadedSettings.priority.perGame.listen);
assert.strictEqual(context.loadedSettings.fastCorrectCooldownDays, 3);

console.log('settings storage tests passed');
