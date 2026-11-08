const puppeteer = require('puppeteer');
(async () => {
  const t0 = Date.now();
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium', headless: 'new',
    args: ['--no-sandbox','--enable-unsafe-swiftshader','--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 640, height: 1060, deviceScaleFactor: 1 });
  const logs = [];
  page.on('console', m => logs.push(m.type() + ': ' + m.text()));
  page.on('pageerror', e => logs.push('ERR ' + e.message));
  await page.goto('http://127.0.0.1:8765/JETSTORM.html', { waitUntil: 'load', timeout: 90000 });
  await new Promise(r => setTimeout(r, 2500));
  console.log('loaded', Date.now()-t0);
  await page.click('#btnStart');
  await new Promise(r => setTimeout(r, 4000));
  const st = await page.evaluate(()=>({sp:document.getElementById('speedNum').textContent,d:document.getElementById('dist').textContent}));
  console.log('started', JSON.stringify(st));
  await page.screenshot({ path: 'v2_run1.png' });
  await page.keyboard.down('Space');
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: 'v2_fly.png' });
  await page.keyboard.up('Space');
  console.log(logs.slice(0,20).join('\n'));
  await browser.close();
  console.log('done', Date.now()-t0);
})();
