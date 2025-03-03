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
  
  // Funkcja do bezpiecznej konwersji wartości boolean
  function safelyConvertToBoolean(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value === 'true';
    if (typeof value === 'number') return value !== 0;
    return false;
  }
  
  for (const data of testData) {
    console.log(`\nTestowe dane: ${JSON.stringify(data)}`);
    
    // Reset ustawień przed każdym testem
    mockSettings.modules.messageLog = false;
    
    // Poprawiona metoda konwersji
    if (data.messageLog !== undefined) {
      const valueType = typeof data.messageLog;
      const value = data.messageLog;
      
      console.log(`Typ wartości: ${valueType}, Wartość: ${value}`);
      
      // Użyj funkcji konwersji
      mockSettings.modules.messageLog = safelyConvertToBoolean(value);
      
      console.log(`Wynik po konwersji: messageLog = ${mockSettings.modules.messageLog}`);
    }
    
    await mockSettings.save();
  }
}