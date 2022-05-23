const puppeteer = require('puppeteer');
const express = require('express');
const app = express();
const md5 = require('md5');
const fs = require('fs');
const cacheDir = './tmp';
const enableCache=true;
const cacheTime=90000*5; //~5 days cache
const port=9999;

const restartChromeOn=100; //restart chrom if we open over 100 pages
const closeChromeTimeout=1000*60*5; //close chrome if no requests for 5 minutes
const loadingSelector='.loader';
const parseContentFunc=(content)=>{
  return content.replace(/\/packs\/css\/stockrow([\-0-9a-z]+)\.css/gi,'/packs/css/stockrow.css');
};

let browser;
let browserHidden;
let restarting=false;
let pagesRender=0;

process.stdin.resume();

async function autoScroll(page){
    await page.evaluate(async () => {
        await new Promise((resolve, reject) => {
            var totalHeight = 0;
            var distance = 100;
            var timer = setInterval(() => {
                var scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;

                if(totalHeight >= scrollHeight){
                    clearInterval(timer);
                    resolve();
                }
            }, 10);
        });
    });
}

function exitApp() {
  console.log('Starting graceful shutdown');
  if (browser) {
    console.log('Closing browser');
    browser.close().then(()=>{
      console.log('Browser closed');
      process.exit();
    });
  } else {
    console.log("Just exit");
    process.exit();
  }

}

process.on('SIGINT', () => {
  console.info('SIGINT signal received.');
  exitApp();

});
process.on('SIGTERM', () => {
  console.info('SIGTERM signal received.');
  exitApp();
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
function strEndsWith(str, suffix) {
    return str.match(suffix+"$")==suffix;
}
function lunchBrowser() {
  return puppeteer.launch({args: ['--no-sandbox'], 'userDataDir': './chrome_cache', headless: true});
}
function getBrowser()
{
  if(restarting) {
    console.log("Browser in restart state");
    return new Promise((resolve)=>{
      setTimeout(()=>{
        console.log("Check if already restarted?");
        resolve(getBrowser());
      },500);
    });
  }
  return new Promise((resolve)=>{
    if(!browser || pagesRender>=restartChromeOn) {
      restarting=true;
       if(browser) {
         console.log('Reopen browser');
         pagesRender=0;

         const tmpFunc=()=>{
           browser.pages().then((pages)=>{
             console.log("Pages opened: ", pages.length);
             if(pages.length<=1) {
               browser.close().then(()=>{
                 console.log("Old Browser closed");
                 lunchBrowser().then((exemplar)=>{
                   console.log("New brower opened");
                   browser=exemplar;
                   restarting=false;
                   resolve(browser);
                 });
               });
             } else {
               console.log("Wait for all pages close");
               setTimeout(()=>{
                 tmpFunc();
               },100)

             }
           });
         };

         tmpFunc();


       } else {
         lunchBrowser().then((exemplar)=>{
           browser=exemplar;
           restarting=false;
           resolve(browser);
         });
       }

     } else {
      resolve(browser);
    }

  })
}
async function getPage(url, options={}) {
  clearTimeout(chromeTa);

  chromeTa = setTimeout(() => {
    if (browser) {
      browser.close().then(() => {
        browser = false;
      });

      console.log('close chrome by timeout');
    }
  }, closeChromeTimeout);

  browser = await getBrowser();
  const page = await browser.newPage();

  //do not load images, svg and css
  if (options.as !== 'png' && options.as !== 'pdf') {
    await page.setRequestInterception(true);
    page.on('request', interceptedRequest => {
      if (
          interceptedRequest.url().endsWith('.png') ||
          interceptedRequest.url().endsWith('.jpg') ||
          interceptedRequest.url().endsWith('.woff2') ||
          interceptedRequest.url().endsWith('.jpeg') ||
          interceptedRequest.url().endsWith('.gif') ||
          interceptedRequest.url().endsWith('.svg') ||
          interceptedRequest.url().endsWith('.css')
      ) {
        interceptedRequest.abort();
      } else {
        interceptedRequest.continue();
      }
    });
  } else {
    console.log('Load full page.');
  }


  console.log('Setting Viewport');
  await page.setViewport({width: options.width ? options.width : 1280, height: options.height ? options.height : 800});

  console.log(`Goto: ${url}`);

  const response = page.goto(url, options.goto ? options.goto : {waitUntil: 'domcontentloaded'});
  console.log('wait goto');
  let wwfError = false;
  try {
    await response;
  } catch (e) {
    wwfError = true;
    console.log("goto error: ", e);
  }
  console.log(`Goto done: ${url}`);
  if (options.square) {
    let square = await page.evaluate(() => {
      const height = document.body.clientHeight;
      const width = document.body.clientWidth;
      if (width > height) {
        return height;
      }
      if (height >= width) {
        return width;
      }
    });
    console.log(`square = ${square}`);
    await page.setViewport({width: square, height: square});

  }

  if (url.indexOf('/interactive_chart/') > -1) {
    await page.waitFor(500);
  }
  // await page.waitFor(1000);

  if (!wwfError) {
    const waitForFunc = page.waitForFunction((loadingSelector) => {
//      if (!document.getElementById('root') || document.getElementById('root').innerHTML === '') {
//        return false;
//      } else {
      if (document.querySelectorAll(loadingSelector).length === 0) {
        return true;
//        }
      }
      return false;
    }, {timeout: 20000}, loadingSelector);

    console.log('waitForFunc: ' + url);
    try {
      await waitForFunc;
    } catch (e) {
      wwfError = true;
      console.log('waitForFunc ERROR: ' + url);
    }
  }

  /*
    console.log('wait waitForFunction #root.innerHTML');
    let success=false;
    let tryes=10;
    while(tryes>0) {
      tryes--;
      console.log('try: '+tryes);
      const waitForFunc = page.waitForFunction("document.querySelector('#root').innerHTML!=''", {timeout: 2000});
      waitForFunc.then(()=>{
        success=true;
        console.log("promise ok");
      }).catch((e) => {
        success=false;
        console.log("promise error");
      });
      try {
        await waitForFunc;
      } catch (e) {
        console.log('await error');
      }

      console.log("success state: "+(success?'true':'false'));
      if(!success) {
        await page.waitFor(500);
      } else {
        break;
      }
    }

    console.log('wait waitForFunction .loader.length');
    success=false;
    tryes=10;
    while(tryes>0) {
      tryes--;
      console.log('try: '+tryes);
      const waitForFunc = page.waitForFunction("document.querySelectorAll('.loader').length === 0", { timeout: 2000 });
      waitForFunc.then(()=>{
        success=true;
        console.log("promise ok");
      }).catch((e) => {
        success=false;
        console.log("promise error");
      });
      try {
        await waitForFunc;
      } catch (e) {
        console.log('await error');
      }

      console.log("success state: "+(success?'true':'false'));
      if(!success) {
        await page.waitFor(500);
      } else {
        break;
      }
    }
    console.log('go next');
    */
  /*console.log('wait waitForSelector');
  await page.waitForSelector('#root div div div');*/
  /*
  if(!options.goto) {
    console.log('implement waitForFunction');
    try {

    } catch (error) {
      console.log('error loading url (timeout)', url,error);
    }
  }
 */

  if (options.as === 'png') {
    console.log('screenshot start!');
    await autoScroll(page);
    let iReturn = await page.screenshot({omitBackground: true, type: 'png'});
    console.log('screenshot done!');
    page.close();
    pagesRender++;
    return {page: iReturn, headers: response.headers};
  } else {

    if (options.as === 'pdf') {
      console.log('pdf start!');
      await page.emulateMedia('screen');
      await autoScroll(page);
      let iReturn = await page.pdf({omitBackground: true, printBackground:true, format:'A4', landscape: options.landscape?true:false });
      console.log('pdf done!');
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
      iReturn = parseContentFunc(iReturn);


      return {page: iReturn, headers: response.headers, wwfError: wwfError};
    }
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
      if (req.query.as == 'png') {
        getPage(req.query.url, {
          goto: {waitUntil: 'networkidle0'},
          as: 'png',
          square: req.query.square ? true : false
        }).then((data) => {
          //Cacher.setCache(req.query.url, data);
          res.send(data.page);
        });
      } else {
        if (req.query.as == 'pdf') {
          getPage(req.query.url, {
            goto: {waitUntil: 'networkidle0'},
            as: 'pdf',
            landscape: req.query.landscape || false,
            square: req.query.square ? true : false
          }).then((data) => {
            //Cacher.setCache(req.query.url, data);
            res.send(data.page);
          });
        } else {
          getPage(req.query.url, {removeScripts: true}).then((data) => {
            if (!data.wwfError) {
              if(!req.query.do_not_cache) {
                Cacher.setCache(req.query.url, data);
              }
            }
            res.send(data.page);
          });
        }
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

