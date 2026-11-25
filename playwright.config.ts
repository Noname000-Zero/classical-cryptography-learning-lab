import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/browser',workers:1,timeout:60000,retries:0,
  use:{baseURL:'http://127.0.0.1:3101',headless:true,viewport:{width:1366,height:900},launchOptions:{executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'},screenshot:'only-on-failure',trace:'retain-on-failure'},
  webServer:{command:'node --import tsx tools/qa-server.ts',url:'http://127.0.0.1:3101/api/health',reuseExistingServer:false,timeout:30000}
});
