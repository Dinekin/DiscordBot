// Ulepszona obsługa trybu ciemnego
// Ten skrypt poprawia działanie przełącznika trybu ciemnego

// Funkcja do ustawienia motywu
function setTheme(themeName) {
    // Zapisz wybór w localStorage
    localStorage.setItem('theme', themeName);
    
    // Ustaw atrybut data-bs-theme na dokumencie
    document.documentElement.setAttribute('data-bs-theme', themeName);
    
    // Zaktualizuj stan przełącznika
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (darkModeToggle) {
        darkModeToggle.checked = themeName === 'dark';
    }
    
    // Zaktualizuj ikonę
    const darkModeIcon = document.getElementById('darkModeIcon');
    if (darkModeIcon) {
        darkModeIcon.className = themeName === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }
    
    // Opcjonalnie: zapisz preferencję w cookie, aby była dostępna po stronie serwera
    document.cookie = `theme=${themeName}; path=/; max-age=31536000`; // 1 rok
}

// Funkcja do przełączania między jasnymi i ciemnymi motywami
function toggleTheme() {
    const currentTheme = localStorage.getItem('theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
}

// Funkcja do wykrywania preferencji systemu
function detectPreferredTheme() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// Nasłuchiwanie zmian preferencji systemu
function listenToSystemPreference() {
    if (window.matchMedia) {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        
        // Obsługa zmiany preferencji systemu
        mediaQuery.addEventListener('change', (e) => {
            // Aktualizuj tylko jeśli użytkownik nie wybrał własnego motywu
            if (!localStorage.getItem('theme')) {
                setTheme(e.matches ? 'dark' : 'light');
            }
        });
    }
}

// Inicjalizacja motywu przy ładowaniu strony
document.addEventListener('DOMContentLoaded', function() {
    // Sprawdź zapisane preferencje lub użyj preferencji systemu
    const savedTheme = localStorage.getItem('theme');
    const preferredTheme = savedTheme || detectPreferredTheme();
    
    // Zastosuj motyw
    setTheme(preferredTheme);
    
    // Ustaw nasłuchiwanie na zmiany przełącznika
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (darkModeToggle) {
        darkModeToggle.addEventListener('change', toggleTheme);
    }
    
    // Nasłuchuj zmian preferencji systemu
    listenToSystemPreference();
});

// Zapewnienie, że motyw jest prawidłowo ustawiony przed załadowaniem DOMu
// Zapobiega to "miganiu" jasnego motywu przy ładowaniu
(function() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        document.documentElement.setAttribute('data-bs-theme', savedTheme);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.setAttribute('data-bs-theme', 'dark');
    }
})();