const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new',
    args: ['--no-sandbox','--enable-unsafe-swiftshader','--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 760, height: 1260 });
  page.on('pageerror', e => console.log('ERR', e.message));
  await page.goto('http://127.0.0.1:8765/JETSTORM.html', { waitUntil: 'load', timeout: 90000 });
  await new Promise(r => setTimeout(r, 2500));
  await page.click('#btnStart');
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: 'hi_run.png' });
  await page.screenshot({ path: 'hi_crop.png', clip: { x: 60, y: 640, width: 640, height: 520 } });
  await browser.close();
})();
