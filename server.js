var http = require('http');
var phantom = require('phantom');
var qs = require('querystring');
var system = require('system');
var fs = require('fs');
var md5 = require('md5');

var phantomCache = './cache';
var tmpDirPath = './tmp';

var cacheTime=1000*60*60; //millisec

if (!fs.existsSync(tmpDirPath)){
    fs.mkdirSync(tmpDirPath);
}

if (!fs.existsSync(phantomCache)){
    fs.mkdirSync(phantomCache);
}


let port=9999;
console.log("Starting... ");

function getPage(url,callback) {
  var sitepage = null;
  var phInstance = null;

  phantom.create([
    '--disk-cache=true',
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
      page.setting('loadCSS', false);
      page.property('onResourceRequested', function(requestData, request) {
        var arr=requestData.url.split(".");
        console.log(arr[arr.length-1]);
        if(arr[arr.length-1]=="css") {
          request.abort();
        }

      });

      page.open(url).then(function(){
        console.log("on page!");
        page.property('content').then(function (content) {
          callback(content);
          phInstance.exit();
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
            //console.log("lalala");
            //console.log(content);
            fs.writeFile(cacheFile, content, function () {
              console.log("cache file write end");
              response.end(content);
            });
            console.log("done");

          });
        };


        fs.stat(cacheFile, (err,stat)=>{
          if(stat) {
            console.log("stat",stat,err,cacheFile);

            var curDate=new Date();
            var fileDate=new Date(stat.birthtime);
            var timeDif=curDate.getTime()-fileDate.getTime();

            if(timeDif>cacheTime) { //10 min
              readPage();
            } else {
              fs.readFile(cacheFile, (err, data)=> {
                if (data) {
                  response.end(data);
                } else {
                  readPage();
                }
              });
            }

          } else {
            readPage();
          }
        });


      });

    });
    server.listen(port);


console.log(`Server listening on ${port}`);