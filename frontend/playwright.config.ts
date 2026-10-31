import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:5190",
    headless: true,
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    },
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5190 --strictPort",
    url: "http://127.0.0.1:5190",
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_LOCAL_DEMO: "false",
      VITE_API_URL: "https://api.ux-tests.invalid",
      VITE_SUPABASE_URL: "https://ux-tests.supabase.co",
      VITE_SUPABASE_ANON_KEY: "public-test-key",
    },
  },
});
