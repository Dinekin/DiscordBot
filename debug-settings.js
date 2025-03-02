// Umieść ten skrypt w osobnym pliku debug-settings.js i uruchom za pomocą Node.js
// lub umieść w konsoli przeglądarki, aby sprawdzić działanie ustawień

require('dotenv').config();
const mongoose = require('mongoose');

// Funkcja do testowania konwersji wartości Boolean
function testBooleanConversion() {
  console.log("=== TESTY KONWERSJI BOOLEAN ===");
  
  const testCases = [
    { value: true, type: "boolean (true)" },
    { value: false, type: "boolean (false)" },
    { value: "true", type: "string ('true')" },
    { value: "false", type: "string ('false')" },
    { value: 1, type: "number (1)" },
    { value: 0, type: "number (0)" },
  ];
  
  testCases.forEach(test => {
    console.log(`\nWartość wejściowa: ${test.value} (${test.type})`);
    
    // Różne metody konwersji
    console.log(`1. value === true:                 ${test.value === true}`);
    console.log(`2. value === 'true':               ${test.value === 'true'}`);
    console.log(`3. Boolean(value):                 ${Boolean(test.value)}`);
    console.log(`4. !!value:                        ${!!test.value}`);
    console.log(`5. value === true || value === 'true': ${test.value === true || test.value === 'true'}`);
  });
}

// Funkcja do testowania aktualizacji ustawień w modelu
async function testSettingsUpdate() {
  console.log("\n=== TESTY AKTUALIZACJI USTAWIEŃ ===");
  
  // Symulowany model z mongoose
  const mockSettings = {
    guildId: "123456789",
    modules: {
      messageLog: false,
      reactionRoles: true, 
      notifications: true
    },
    logDeletedOnly: false,
    save: function() {
      console.log("\nZapisane ustawienia:");
      console.log(JSON.stringify(this, null, 2));
      return Promise.resolve(this);
    }
  };
  
  // Symulowane dane z formularza
  const testData = [
    { messageLog: true },
    { messageLog: false },
    { messageLog: "true" },
    { messageLog: "false" }
  ];
  
  for (const data of testData) {
    console.log(`\nTestowe dane: ${JSON.stringify(data)}`);
    
    // Reset ustawień przed każdym testem
    mockSettings.modules.messageLog = false;
    
    // Nowa metoda (prawidłowa)
    if (data.messageLog !== undefined) {
      const valueType = typeof data.messageLog;
      const value = data.messageLog;
      
      console.log(`Typ wartości: ${valueType}, Wartość: ${value}`);
      
      if (valueType === 'boolean') {
        mockSettings.modules.messageLog = value;
      } else if (valueType === 'string') {
        mockSettings.modules.messageLog = (value === 'true');
      }
      
      console.log(`Wynik po konwersji: messageLog = ${mockSettings.modules.messageLog}`);
    }
    
    await mockSettings.save();
  }
}

async function main() {
  try {
    testBooleanConversion();
    await testSettingsUpdate();
    console.log("\nTesty zakończone!");
  } catch (error) {
    console.error("Błąd podczas testów:", error);
  }
}

main();