const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: 'new',
    args: ['--no-sandbox','--disable-setuid-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage','--window-size=900,1600']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 1600, deviceScaleFactor: 1 });
  const logs = [];
  page.on('console', m => logs.push('[' + m.type() + '] ' + m.text()));
  page.on('pageerror', e => logs.push('[pageerror] ' + e.message));
  page.on('requestfailed', r => logs.push('[reqfail] ' + r.url() + ' ' + r.failure()?.errorText));
  await page.goto('file://' + __dirname + '/index.html', { waitUntil: 'load', timeout: 60000 });
  await new Promise(r => setTimeout(r, 3500));
  await page.screenshot({ path: 'shot_start.png' });
  await page.click('#btnStart');
  await new Promise(r => setTimeout(r, 2600));
  await page.screenshot({ path: 'shot_run1.png' });
  // simulate jet + right
  await page.keyboard.down('Space');
  await page.keyboard.down('ArrowRight');
  await new Promise(r => setTimeout(r, 1200));
  await page.keyboard.up('ArrowRight');
  await new Promise(r => setTimeout(r, 900));
  await page.screenshot({ path: 'shot_fly.png' });
  await page.keyboard.up('Space');
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: 'shot_run2.png' });
  console.log(logs.slice(0, 40).join('\n'));
  const st = await page.evaluate(() => {
    const s = document.getElementById('speedNum')?.textContent;
    return { speed: s, dist: document.getElementById('dist')?.textContent, score: document.getElementById('score')?.textContent };
  });
  console.log('STATE', JSON.stringify(st));
  await browser.close();
})();
