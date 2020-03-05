const puppeteer = require('puppeteer');
const express = require('express');
const app = express();
const md5 = require('md5');
const fs = require('fs');
const cacheDir = './tmp';
const enableCache=true;
const cacheTime=90000; //1 day cache
const port=9999;

const restartChromeOn=100; //restart chrom if we open over 100 pages
const closeChromeTimeout=1000*60*5; //close chrome if no requests for 5 minutes
const loadingSelector='.common-loading';

let browser;
let pagesRender=0;

process.stdin.resume();
process.on('exit', ()=>{
  if(browser) {
    browser.close();
  }
  process.exit();
});

if (enableCache && !fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir);
}

if (enableCache && !fs.existsSync('./chrome_cache')) {
    fs.mkdirSync('./chrome_cache');
}

let chromeTa=false;

function log(str) {
  console.log(str);
}

async function getPage(url, options={}) {
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
    browser = await puppeteer.launch({args: ['--no-sandbox'], 'userDataDir':'./chrome_cache' });
  }
  const page = await browser.newPage();

  //do not load images, svg and css
  if(options.as!=='png') {
    await page.setRequestInterception(true);
    page.on('request', interceptedRequest => {
      if (
        interceptedRequest.url.endsWith('.png') ||
        interceptedRequest.url.endsWith('.jpg') ||
        interceptedRequest.url.endsWith('.jpeg') ||
        interceptedRequest.url.endsWith('.gif') ||
        interceptedRequest.url.endsWith('.svg') ||
        interceptedRequest.url.endsWith('.css')
      ) {
        interceptedRequest.abort();
      } else {
        interceptedRequest.continue();
      }
    });
  } else {
    console.log('As png. Load full page.');
  }

  console.log('Setting Viewport');
  await page.setViewport({width: options.width?options.width:1280, height: options.height?options.height:800 });
  //await page.waitForNavigation({ waitUntil: 'networkidle0' });
  console.log(`Goto: ${url}`);
  const response=await page.goto(url,options.goto?options.goto:{});
  console.log(`Goto done: ${url}`);
  if(options.square) {
    let square=await page.evaluate(()=>{
      const height=document.body.clientHeight;
      const width=document.body.clientWidth;
      if(width>height) {
        return height;
      }
      if(height>=width) {
        return width;
      }
    });
    console.log(`square = ${square}`);
    await page.setViewport({width: square, height: square });

  }
  if(!options.goto) {
    try {
      await page.waitForFunction(function () {
        let loadingSelector=arguments[0].loading_selector;
        console.log('loadingSelector',loadingSelector);
        if (document.querySelectorAll(loadingSelector).length == 0) {
          return true;
        } else {
          const arr = document.querySelectorAll(loadingSelector);
          let num = arr.length;
          for (var i in arr) {
            let cur = arr[i];
            while (cur) {
              if (cur.style && cur.style.display == 'none') {
                num--;
                cur = false;
                break;
              }
              if (cur) {
                cur = cur.parentNode;
              }
            }
          }

          if (num === 0) {
            return true;
          }
          //document.querySelectorAll('.loadingText')[0].parentNode.parentNode.parentNode.style.display
        }
      }, {timeout: 10000},{ loading_selector:loadingSelector });
    } catch (error) {
      console.log('error', error);
    }
  }

  if(url.indexOf('/interactive_chart/')>-1) {
    await page.waitFor(500);
  }
  if(options.as==='png') {
    console.log('screenshot start!');
    let iReturn = await page.screenshot({ omitBackground:true, type:'png' });
    console.log('screenshot done!');
    page.close();
    pagesRender++;
    return {page: iReturn, headers: response.headers};
  } else {
    let iReturn = await page.content();
    page.close();
    pagesRender++;

    if (options.removeScripts) {
      iReturn = iReturn.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    }

    return {page: iReturn, headers: response.headers};
  }
}


class Cache
{
  constructor(props) {
    this.working={};
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
    if(enableCache && !req.query.clear_cache) {
      cache = Cacher.getCache(req.query.url);
    }
    if(enableCache && cache && !req.query.clear_cache) {
      console.log(`from cache: ${req.query.url}`);
      res.send(cache.page);
    } else {
      console.log(`request page: ${req.query.url} as=${req.query.as}`, req.query);
      if(req.query.as=='png') {
        console.log('var 1');
        getPage(req.query.url, { goto:{ waitUntil:'networkidle0' }, as:'png', square:req.query.square?true:false }).then((data) => {
          //Cacher.setCache(req.query.url, data);
          res.send(data.page);
        });
      } else {
        console.log('var 2');
        getPage(req.query.url, {removeScripts: true}).then((data) => {
          Cacher.setCache(req.query.url, data);
          res.send(data.page);
        });
      }
    }
  } else {
    res.send(new Date());
  }
});

var args = process.argv.slice(2);
console.log('args',args);

if(args.indexOf('--localhost')!==-1) {
  app.listen(port,'localhost', function () {
    console.log(`Misty listening localhost on port ${port}!`);
  });
} else {
  app.listen(port, function () {
    console.log(`Misty listening on port ${port}!`);
  });
}
