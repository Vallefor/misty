const puppeteer = require('puppeteer');
const express = require('express');
const app = express();
const md5 = require('md5');
const fs = require('fs');
const cacheDir = './tmp';
const enableCache=false;
const cacheTime=5;
const port=9999;

const restartChromeOn=100; //restart chrom if we open over 100 pages
const closeChromeTimeout=1000*60*5; //close chrome if no requests for 5 minutes


let browser;
let pagesRender=0;

if (enableCache && !fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir);
}

let chromeTa=false;

async function getPage(url) {
  clearTimeout(chromeTa);

  chromeTa=setTimeout(()=>{
    if(browser) {
      browser.close().then(()=>{
        browser=false;
      });

      console.log('close chrome by timeout');
    }
  },closeChromeTimeout);

  if(!browser || pagesRender==restartChromeOn) {
    if(browser) {
      pagesRender=0;
      console.log('stop chrome by pages render');
      await browser.close();
    }
    browser = await puppeteer.launch({args: ['--no-sandbox']});
  }
  const page = await browser.newPage();
  await page.setRequestInterception(true);

  //do not load images and css
  page.on('request', interceptedRequest => {
    if (
      interceptedRequest.url.endsWith('.png') ||
      interceptedRequest.url.endsWith('.jpg') ||
      interceptedRequest.url.endsWith('.jpeg') ||
      interceptedRequest.url.endsWith('.gif') ||
      interceptedRequest.url.endsWith('.css')
    ) {
      interceptedRequest.abort();
    } else {
      interceptedRequest.continue();
    }
  });

  await page.setViewport({width: 1280, height: 800 });
  const response=await page.goto(url);
  await page.waitForFunction("document.querySelectorAll('.loadingText').length == 0",{ timeout: 10000 });
  let iReturn=await page.content();
  page.close();
  pagesRender++;
  return {page:iReturn,headers:response.headers};
}


class Cache
{
  constructor(props) {
    this.working={};
    console.log('constructor fired!');
  }
  getCache(url) {
    const path=this.getCacheFilePath(url);
    if (fs.existsSync(path)) {
      const contents = fs.readFileSync(path);
      const ob = JSON.parse(contents);
      const curDate = new Date();
      const curTimestamp = parseInt(curDate.getTime() / 1000);

      if (curTimestamp - ob.timestamp > cacheTime) {
        fs.unlinkSync(path);
      } else {
        return ob;
      }
    }

    return false;
  }
  getCacheFilePath(url)
  {
    return `${cacheDir}/${md5(url)}.json`;
  }
  setCache(url,contentOb) {
    const cacheFile=this.getCacheFilePath(url);
    if(!this.working[cacheFile]) {
      this.working[cacheFile] = true;
      const d=new Date();
      contentOb.timestamp=parseInt(d.getTime()/1000);
      fs.writeFile(cacheFile, JSON.stringify(contentOb), ()=>{
        delete this.working[cacheFile];
      });
    }
  }
}

const Cacher=new Cache();

app.get('/', function (req, res) {
  if(req.query.url) {
    let cache;
    if(enableCache) {
      cache = Cacher.getCache(req.query.url);
    }
    if(enableCache && cache) {
      console.log(`from cache: ${req.query.url}`);
      res.send(cache.page);
    } else {
      console.log(`request page: ${req.query.url}`);
      getPage(req.query.url).then((data)=> {
        Cacher.setCache(req.query.url,data);
        res.send(data.page);
      });
    }
  } else {
    res.send(new Date());
  }
});

app.listen(port, function () {
  console.log(`Misty listening on port ${port}!`);
});