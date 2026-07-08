export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'chromium/bg.js',
      'chromium/popup.js',
      'firefox/background.js',
      'firefox/popup.js'
    ]
  },
  {
    files: ['src/**/*.{js,jsx}', 'chromium/sw.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        chrome: 'readonly',
        document: 'readonly',
        globalThis: 'readonly',
        localStorage: 'readonly',
        navigator: 'readonly',
        performance: 'readonly',
        setInterval: 'readonly',
        setTimeout: 'readonly',
        clearInterval: 'readonly',
        window: 'readonly'
      }
    }
  }
];
