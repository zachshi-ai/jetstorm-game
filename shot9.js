const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new',
    args: ['--no-sandbox','--enable-unsafe-swiftshader','--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 480, height: 820 });
  const logs = [];
  page.on('console', m => { const t = m.text(); if (/GLB_|HDR_|FAIL|ERR/.test(t)) logs.push(t); });
  page.on('pageerror', e => logs.push('ERR ' + e.message));
  await page.goto('http://127.0.0.1:8765/JETSTORM.html?lite=1', { waitUntil: 'load', timeout: 60000 });
  await new Promise(r => setTimeout(r, 3000));
  await page.click('#btnStart');
  await new Promise(r => setTimeout(r, 4500));
  await page.screenshot({ path: 'r_run.png' });
  console.log(logs.join('\n') || 'no-glb-logs');
  await browser.close();
})();
