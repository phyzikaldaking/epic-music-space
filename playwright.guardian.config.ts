import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/guardian',
  use: {
    baseURL: process.env.GUARDIAN_BASE_URL || 'https://epic-music-space.vercel.app',
    headless: true,
    viewport: { width: 1440, height: 900 },
  },
  reporter: [['list']],
});
