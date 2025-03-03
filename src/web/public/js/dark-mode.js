// Add this file as src/web/public/js/dark-mode.js

// Function to set the theme
function setTheme(themeName) {
    localStorage.setItem('theme', themeName);
    document.documentElement.setAttribute('data-bs-theme', themeName);
    
    // Update the toggle switch
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (darkModeToggle) {
      darkModeToggle.checked = themeName === 'dark';
    }
    
    // Update the icon
    const darkModeIcon = document.getElementById('darkModeIcon');
    if (darkModeIcon) {
      darkModeIcon.className = themeName === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }
  }
  
  // Function to toggle between light and dark themes
  function toggleTheme() {
    const currentTheme = localStorage.getItem('theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
  }
  
  // Initialize theme on page load
  document.addEventListener('DOMContentLoaded', function() {
    // Check for saved theme preference or use device preference
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const defaultTheme = savedTheme || (prefersDark ? 'dark' : 'light');
    
    // Apply the theme
    setTheme(defaultTheme);
    
    // Set up the toggle event listener
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (darkModeToggle) {
      darkModeToggle.addEventListener('change', toggleTheme);
    }
  });