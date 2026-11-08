const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new',
    args: ['--no-sandbox','--enable-unsafe-swiftshader','--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 420, height: 700 });
  await page.goto('http://127.0.0.1:8765/JETSTORM.html?lite=1', { waitUntil: 'load', timeout: 60000 });
  await new Promise(r => setTimeout(r, 1500));
  await page.click('#btnStart');
  await new Promise(r => setTimeout(r, 4000));
  await page.screenshot({ path: 'q_run.png' });
  console.log('shot done');
  await browser.close();
})();
