const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  console.log('start');
  const page = await browser.newPage();
  console.log('new page');
  //await page.goto('https://stockrow.com', {waitUntil: 'networkidle0'});
  //await page.waitForNavigation({ waitUntil: "networkidle2" });
  await page.setViewport({width: 1280, height: 800 });
  await page.goto('https://stockrow.com');
  console.log('waitForFunction start');
  await page.waitForFunction("document.querySelectorAll('.loadingText').length == 0");
  //document.querySelectorAll(
  console.log('waitForFunction end');


  //console.log('waitForNavigation setted');
  console.log(await page.content());
  await page.screenshot({path: 'screenshot.png',fullPage:true});
  //await page.pdf({path: 'hn.pdf', format: 'A4'});

  await browser.close();
})();