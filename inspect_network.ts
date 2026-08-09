import { chromium } from 'playwright';
import fs from 'fs';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.new_context();
  const page = await context.newPage();

  // Injetar sessão se necessário (como o Lovable faz)
  const storageKey = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
  const sessionJson = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
  
  await page.goto('http://localhost:8080');
  if (storageKey && sessionJson) {
    await page.evaluate((key, session) => {
      window.localStorage.setItem(key, session);
    }, storageKey, sessionJson);
  }

  // Monitorar requests
  page.on('request', request => {
    if (request.url().includes('categories') || request.url().includes('functions')) {
      console.log(`Request: ${request.method()} ${request.url()}`);
      if (request.postData()) console.log(`Payload: ${request.postData()}`);
    }
  });

  page.on('response', async response => {
    if (response.url().includes('categories') || response.url().includes('functions')) {
      console.log(`Response: ${response.status()} ${response.url()}`);
      try {
        const json = await response.json();
        console.log(`Body: ${JSON.stringify(json).slice(0, 500)}...`);
      } catch (e) {}
    }
  });

  await page.goto('http://localhost:8080/app/categories');
  await page.waitForTimeout(5000); // Esperar carregar
  
  await page.screenshot({ path: '/tmp/browser/categories_screen.png' });
  
  await browser.close();
}
run();
