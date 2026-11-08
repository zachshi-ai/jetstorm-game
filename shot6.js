const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new',
    args: ['--no-sandbox','--enable-unsafe-swiftshader','--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 760, height: 1260 });
  page.on('pageerror', e => console.log('ERR', e.message));
  await page.goto('http://127.0.0.1:8765/JETSTORM.html', { waitUntil: 'load', timeout: 90000 });
  await new Promise(r => setTimeout(r, 2500));
  await page.screenshot({ path: 'f_start.png' });
  await page.click('#btnStart');
  await new Promise(r => setTimeout(r, 3500));
  await page.screenshot({ path: 'f_run.png' });
  await page.keyboard.down('Space');
  await page.keyboard.down('ArrowLeft');
  await new Promise(r => setTimeout(r, 900));
  await page.keyboard.up('ArrowLeft');
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: 'f_fly.png' });
  await page.keyboard.up('Space');
  await new Promise(r => setTimeout(r, 2500));
  await page.screenshot({ path: 'f_run2.png' });
  const st = await page.evaluate(() => ({ sp: document.getElementById('speedNum').textContent, d: document.getElementById('dist').textContent, sc: document.getElementById('score').textContent }));
  console.log('STATE', JSON.stringify(st));
  await browser.close();
})();
