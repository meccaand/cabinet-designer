import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

/** `npm run screenshots`: regenerates the README images in docs/screenshots. */
export default defineConfig({
  ...base,
  testDir: 'scripts',
  testMatch: 'screenshots.ts',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  projects: [
    {
      name: 'screenshots',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
});
