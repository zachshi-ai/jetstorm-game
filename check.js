const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new',
    args: ['--no-sandbox','--enable-unsafe-swiftshader','--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 360, height: 600 });
  const errs = [];
  page.on('pageerror', e => errs.push('ERR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 120)); });
  await page.goto('http://127.0.0.1:8765/JETSTORM.html?lite=1', { waitUntil: 'load', timeout: 60000 });
  await new Promise(r => setTimeout(r, 1200));
  await page.click('#btnStart');
  await new Promise(r => setTimeout(r, 6000));
  const st = await page.evaluate(() => ({
    speed: document.getElementById('speedNum').textContent,
    dist: document.getElementById('dist').textContent
  }));
  console.log('STATE', JSON.stringify(st));
  console.log(errs.length ? errs.join('\n') : 'NO_ERRORS');
  await browser.close();
})();
