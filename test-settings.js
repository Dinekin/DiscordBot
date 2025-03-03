require('dotenv').config();
const mongoose = require('mongoose');
const logger = require('./src/utils/logger');

// Funkcja pomocnicza do bezpiecznej konwersji na boolean
function safelyConvertToBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value === 'true';
  if (typeof value === 'number') return value !== 0;
  return false;
}

// Testowe przypadki
const testCases = [
  { value: true, expected: true, desc: "boolean true" },
  { value: false, expected: false, desc: "boolean false" },
  { value: "true", expected: true, desc: "string 'true'" },
  { value: "false", expected: false, desc: "string 'false'" },
  { value: 1, expected: true, desc: "number 1" },
  { value: 0, expected: false, desc: "number 0" },
  { value: undefined, expected: false, desc: "undefined" },
  { value: null, expected: false, desc: "null" },
  { value: "", expected: false, desc: "empty string" }
];

// Testy konwersji
function runConversionTests() {
  console.log("=== TESTY KONWERSJI BOOLEAN ===");
  
  testCases.forEach(test => {
    const result = safelyConvertToBoolean(test.value);
    const passed = result === test.expected;
    
    console.log(`[${passed ? 'PASS' : 'FAIL'}] ${test.desc}: ${test.value} => ${result} (oczekiwano: ${test.expected})`);
  });
}

// Symulacja aktualizacji modelu
async function simulateModelUpdate() {
  console.log("\n=== SYMULACJA AKTUALIZACJI MODELU ===");
  
  // Symulowany model
  const mockModel = {
    guildId: "123456789",
    modules: {
      messageLog: false,
      reactionRoles: true,
      notifications: true
    },
    logDeletedOnly: false,
    save: function() {
      console.log("Model zaktualizowany:");
      console.log(JSON.stringify(this, null, 2));
      return Promise.resolve(this);
    }
  };
  
  // Symulowane dane z formularza/API
  const testRequests = [
    { body: { messageLog: true }, desc: "messageLog jako true (boolean)" },
    { body: { messageLog: "true" }, desc: "messageLog jako 'true' (string)" },
    { body: { "modules.messageLog": true }, desc: "modules.messageLog jako true (boolean)" },
    { body: { "modules.messageLog": "true" }, desc: "modules.messageLog jako 'true' (string)" }
  ];
  
  // Przetestuj każdy przypadek
  for (const test of testRequests) {
    console.log(`\nTest: ${test.desc}`);
    console.log(`Dane wejściowe: ${JSON.stringify(test.body)}`);
    
    // Resetuj model przed każdym testem
    mockModel.modules.messageLog = false;
    
    // Obsłuż messageLog bezpośrednio
    if (test.body.messageLog !== undefined) {
      mockModel.modules.messageLog = safelyConvertToBoolean(test.body.messageLog);
    }
    
    // Obsłuż modules.messageLog
    if (test.body["modules.messageLog"] !== undefined) {
      mockModel.modules.messageLog = safelyConvertToBoolean(test.body["modules.messageLog"]);
    }
    
    await mockModel.save();
  }
}

// Główna funkcja
async function main() {
  try {
    // Uruchom testy
    runConversionTests();
    await simulateModelUpdate();
    
    console.log("\nTesty zakończone.");
  } catch (error) {
    console.error("Błąd podczas testów:", error);
  } finally {
    // Zakończ proces
    process.exit(0);
  }
}

// Uruchom testy
main();