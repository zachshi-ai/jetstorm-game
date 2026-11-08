const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new',
    args: ['--no-sandbox','--enable-unsafe-swiftshader','--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 420, height: 700 });
  const logs = [];
  page.on('console', m => { const t = m.text(); if (/TEX_|ERR|FAIL/.test(t)) logs.push(t); });
  page.on('pageerror', e => logs.push('ERR ' + e.message));
  await page.goto('http://127.0.0.1:8765/JETSTORM.html', { waitUntil: 'load', timeout: 90000 });
  await new Promise(r => setTimeout(r, 2500));
  await page.click('#btnStart');
  await new Promise(r => setTimeout(r, 2500));
  await page.screenshot({ path: 'v3_run.png' });
  console.log(logs.join('\n'));
  await browser.close();
})();
