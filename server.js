var http = require('http');
var phantom = require('phantom');
var qs = require('querystring');
var system = require('system');
var fs = require('fs');
var md5 = require('md5');

var phantomCache = './cache';
var tmpDirPath = './tmp';

var cacheTime=1000*60*60; //millisec
cacheTime=1000*5;

if (!fs.existsSync(tmpDirPath)){
    fs.mkdirSync(tmpDirPath);
}

if (!fs.existsSync(phantomCache)){
    fs.mkdirSync(phantomCache);
}

var working={};

let port=9999;
console.log("Starting... ");

function getPage(url,callback) {
  var sitepage = null;
  var phInstance = null;

  phantom.create([
//    '--disk-cache=true',
    '--load-images=false',
    `--disk-cache-path=${phantomCache}`,
    '--max-disk-cache-size=102400',
    `--cookies-file=${__dirname}/cache/cookie.txt`,
    //'--debug=true'
  ]).then(ph=> {
      console.log("created");
      ph.cookiesEnabled=false;
      phInstance=ph;
      return ph.createPage();
    })
    .then(page=> {
      console.log("page here",typeof page);

      page.setting('loadImages', false);
      //page.setting('loadCSS', false);
      var resCount=0;

      /*
      page.property('onResourceReceived', true, function(requestData) {
        resCount--;
        console.log("res count onResourceReceived",resCount);
      });
      */
      page.property('onResourceRequested', function(requestData, request) {
        var arr=requestData.url.split(".");
        console.log("request",requestData.url);
        if(arr[arr.length-1]=="css") {
          request.abort();
        } else {
          console.log("res count",resCount);
        }

      });

      page.open(url).then(function(){
        console.log("on page!");
        page.property('content').then(function (content) {
          var returnFunction=function(){
            callback(content);
            phInstance.exit();
          };
          returnFunction();
          /*
          if(resCount==0) {
            console.log("res count",resCount);
            returnFunction();
          } else {
            var interval=setInterval(function(){
              console.log("res count",resCount);
              if(resCount==0) {
                returnFunction();
              }
            },10);

            setTimeout(function(){
              clearInterval(interval);
              returnFunction();
            },5000);
          }
          */

        });
      });

    })
    .catch(error => {
      console.log(error);
      phInstance.exit();
    });

}


    var server = http.createServer(function(request, response) {
      console.log(request.url);

      var body = [];
      request.on('data', function(chunk) {
        body.push(chunk);
      }).on('end', function() {
        body = Buffer.concat(body).toString();

        var post = qs.parse(body);
        console.log(post);
        var cacheFile=`${tmpDirPath}/${md5(request.url)}`;

        var readPage=function() {
          getPage(post.url,function(content) {

            /*if(!working[cacheFile]) {
              working[cacheFile]=true;*/
              fs.writeFile(cacheFile, content,function(){
                console.log('delete '+cacheFile);
                delete working[cacheFile];
              });
            //}

            response.end(content);

            console.log("done");

          });
        };


        fs.stat(cacheFile, (err,stat)=>{

          var readAndSend=function() {
            fs.readFile(cacheFile, (err, data)=> {
              if (data) {
                response.end(data);
              } else {
                readPage();
              }
            });
          };

          if(stat) {
            console.log("stat",stat,err,cacheFile);

            var curDate=new Date();
            var fileDate=new Date(stat.birthtime);
            var timeDif=curDate.getTime()-fileDate.getTime();

            if(timeDif>cacheTime) { //10 min
              if(!working[cacheFile]) {
                working[cacheFile]=true;
                getPage(post.url,function(content) {
                  fs.writeFile(cacheFile, content,function(){
                    delete working[cacheFile];
                  });
                });
              }
              readAndSend();
            } else {
              readAndSend();
            }

          } else {
            if(working[cacheFile]) {

              var intervalWork=setInterval(()=>{
                if(!working[cacheFile]) {
                  clearInterval(intervalWork);
                  readAndSend();
                } else {
                  console.log("working = true");
                }
              },100);

            } else {
              working[cacheFile]=true;
              readPage();
            }
          }
        });


      });

    });
    server.listen(port);


console.log(`Server listening on ${port}`);