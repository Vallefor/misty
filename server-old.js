
var http = require('http');
//var phantom = require('phantom');
const phantom = require('phantom');
var qs = require('querystring');
var system = require('system');
var fs = require('fs');
var md5 = require('md5');

var phantomCache = './cache';
var tmpDirPath = './tmp';

var sendDataWileCacheRefresh=false;
var returnAsJson=false;

var cacheTime=1000*60*60; //millisec
//cacheTime=1000*5;
cacheTime=false; //disable cache by default


if (!fs.existsSync(tmpDirPath)){
    fs.mkdirSync(tmpDirPath);
}

if (!fs.existsSync(phantomCache)){
    fs.mkdirSync(phantomCache);
}

var working={};

var contentParser=function(content) {
  //return content;
  return content.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,'');
};


let port=9999;
console.log("Starting... ");

function normalizeUrl(url) {
  return url;
  url=url.toLowerCase();
  url=url.replace(/\/$/, "");
  return url;
}

let pages=[];
let loadedPages=[];
let loadedPagesBusy=[];
let globalPhantom;
let startTimerGlobal=new Date().getTime();
/*
phantom.create([
    '--disk-cache=true',
    '--load-images=false',
    `--disk-cache-path=${phantomCache}`,
    '--max-disk-cache-size=10240000',
    `--cookies-file=${__dirname}/cache/cookie.txt`,
    //'--debug=true'
  ]).then(ph=> {
    console.log("created");
    ph.cookiesEnabled=false;
    globalPhantom=ph;
    for(let i=0;i<10;i++) {
      pages.push(ph.createPage());
      loadedPagesBusy.push(false);
    }
    return Promise.all(pages);
  }).then(pages=>{
    loadedPages=pages;
  });
  */

function getBrowserTab()
{
  return phantom.create([
    '--disk-cache=true',
    '--load-images=false',
    `--disk-cache-path=${phantomCache}`,
    '--max-disk-cache-size=10240000',
    `--cookies-file=${__dirname}/cache/cookie.txt`,
    //'--debug=true'
  ]).then(ph=> {
    console.log("created");
    ph.cookiesEnabled=false;
    globalPhantom=ph;
    return ph.createPage();
  });

}
async function getPageV2(url,callback) {

  const instance = await phantom.create();
  const page = await instance.createPage();

  await page.property("onConsoleMessage", function(msg) { console.log(msg)});

  await page.on('onResourceRequested', function(requestData,request) {
    console.info('Requesting', requestData.url);
  });

  await page.on('onResourceReceived', function(requestData) {
    console.info('Received', requestData.url);
  });



  const status = await page.open(url);
  setTimeout(async ()=> {
    const content = await page.property('content');
    await instance.exit();
    callback(content);
  },5000);

  return false;
}

getPageV2('http://develop.myanimeshelf.com:3000',function(data){
  console.log('content',data)
});

return;

function getPage(url,callback) {




  let startTimer = new Date().getTime();

  var sitepage = null;
  var phInstance = null;
  let pageOb = getBrowserTab();
  pageOb.then(page=> {

    //let page = pageOb.page;

    console.log("page here", new Date().getTime() - startTimer);
    page.setting('loadImages', false);
    //page.setting('loadCSS', false);
    var resCount = 0;
    //let httpStatus=0;
    //let exchanger={ httpStatus:0, url:url };
    let exchanger = globalPhantom.createOutObject();
    exchanger.url = url;
    exchanger.normalizeUrl = normalizeUrl;
    exchanger.requestCounter = 0;
    exchanger.requestSumm = 0;
    page.property('onResourceReceived', function (resource, exchanger) {
      if (resource.stage == "start") {
        exchanger.requestCounter++;
        console.log("counter inc", exchanger.requestCounter, exchanger.requestSumm, resource.url);
      }
      if (resource.stage == "end") {
        //console.log('received', resource.url);
        if (resource.url) {
          exchanger.requestCounter--;
          console.log("counter dec", exchanger.requestCounter, exchanger.requestSumm, resource.status, resource.url);
        }
        if (exchanger.url == exchanger.normalizeUrl(resource.url)) {
          exchanger.httpStatus = resource.status;
          //console.log('onResourceReceived', resource.url, resource.status, exchanger.httpStatus, exchanger.url);
          //return exchanger;
        }
      }
    }, exchanger);


    page.property('onResourceRequested', function (requestData, request) {
      var arr = requestData.url.split(".");
      console.log("---------- request", requestData.url);
      if (
        requestData.url.indexOf("googlesyndication") > -1
        ||
        requestData.url.indexOf("googleads") > -1
        ||
        requestData.url.indexOf("gstatic.com/recaptcha") > -1
        ||
        requestData.url.indexOf("google-analytics") > -1
          /*||
           requestData.url.indexOf("cdn.ravenjs.com")>-1*/
        ||
        requestData.url.indexOf("www.google.com/recaptcha") > -1
      ) {
        request.abort();
      }
      if (arr[arr.length - 1] == "css") {
        request.abort();
      } else {
        //exchanger.requestSumm++;
      }

    });

    page.open(url).then(function () {
      console.log("on page!");

      //var onPageExec = function () {
      /*exchanger.property("httpStatus").then((httpStatus)=> {
       console.log("here status is", httpStatus, exchanger.httpStatus);
       });*/


      //};
      /*setTimeout(()=> {
       onPageExec();
       }, 3000);*/
      page.property('content').then(function (content) {

        var returnFunction = function () {
          console.log(content);
          callback(content);
          globalPhantom.exit();
        };
        setTimeout(()=> {
          returnFunction();
        }, 5000);

        /*
         page.evaluate(function () {
         if (document.getElementById('httpStatus')) {
         return parseInt(document.getElementById('httpStatus').innerHTML);
         } else {
         return null;
         }
         }).then(function (jsHttpStatus) {
         let returnFunction = function () {
         exchanger.property("httpStatus").then((httpStatus)=> {
         const status = jsHttpStatus ? jsHttpStatus : httpStatus;
         console.log("http status is", status);
         setTimeout(function () {
         //callback(JSON.stringify({httpStatus: status, content: contentParser(content)}));
         callback({httpStatus: status, content: contentParser(content)});
         }, 4000);


         //phInstance.exit();
         });
         };
         returnFunction();

         });
         */

      });


    });

  });


}


    var server = http.createServer(function(request, response) {
      console.log(request.url);
      var getVars=request.url.split('?')[1];
      getVars=qs.parse(getVars);

      var body = [];
      request.on('data', function(chunk) {
        body.push(chunk);
      }).on('end', function() {
        body = Buffer.concat(body).toString();



        //var post = qs.parse(body);
        getVars.url=normalizeUrl(getVars.url);
        console.log(getVars);

        var cacheFile=`${tmpDirPath}/${md5(getVars.url)}`;

        var readPage=function() {
          getPage(getVars.url,function(content) {

            /*if(!working[cacheFile]) {
              working[cacheFile]=true;*/
            if(cacheTime!==false) {
              console.log('write cache ' + cacheFile);
              fs.writeFile(cacheFile, JSON.stringify(content), function () {
                console.log('delete ' + cacheFile);
                delete working[cacheFile];
              });
            }
            //}

            if(returnAsJson) {
              response.end(JSON.stringify(content));
            } else {
              response.statusCode=content.httpStatus;
              response.end(content.content);
            }

            console.log("done");

          });
        };

        if(cacheTime!==false) {
          fs.stat(cacheFile, (err, stat)=> {

            var readAndSend = function () {
              fs.readFile(cacheFile, (err, data)=> {
                if (data) {
                  if(returnAsJson) {
                    response.end(data);
                  } else {
                    var data=JSON.parse(data);
                    response.statusCode = data.httpStatus;
                    response.end(data.content);
                  }
                } else {
                  readPage();
                }
              });
            };

            if (stat) {
              //console.log("stat",stat,err,cacheFile);

              var curDate = new Date();
              var fileDate = new Date(stat.birthtime);
              var timeDif = curDate.getTime() - fileDate.getTime();

              if (timeDif > cacheTime) {
                if (!working[cacheFile]) {
                  working[cacheFile] = true;
                  getPage(getVars.url, function (content) {
                    if (!sendDataWileCacheRefresh) {
                      if(returnAsJson) {
                        response.end(JSON.stringify(content));
                      } else {
                        response.statusCode=content.httpStatus;
                        response.end(content.content);
                      }
                    }
                    fs.writeFile(cacheFile, JSON.stringify(content), function () {
                      delete working[cacheFile];
                    });
                  });
                }
                if (sendDataWileCacheRefresh) {
                  readAndSend();
                }
              } else {
                readAndSend();
              }

            } else {
              if (working[cacheFile]) {

                var intervalWork = setInterval(()=> {
                  if (!working[cacheFile]) {
                    clearInterval(intervalWork);
                    readAndSend();
                  } else {
                    console.log("working = true");
                  }
                }, 100);

              } else {
                working[cacheFile] = true;
                readPage();
              }
            }
          });
        } else {
          console.log('cache disabled');
          readPage();
        }


      });

    });
    server.listen(port);


console.log(`Server listening on ${port}`);