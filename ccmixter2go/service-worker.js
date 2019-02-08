var cacheName = 'ccmixter2go';

var filesToCache = ["index.html", "js/sotd.js", "manifest.json"];

self.addEventListener('install', function(e) {
  console.log('[ServiceWorker] Install');
  e.waitUntil(
    caches.open(cacheName).then(function(cache) {
      console.log('[ServiceWorker] Caching app shell');
      return cache.addAll(filesToCache);
    })
    .then(function() {
    	return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function(e) {
  console.log('[ServiceWorker] Activate');
  e.waitUntil(
    caches.keys().then(function(keyList) {
      return Promise.all(keyList.map(function(key) {
        if (key !== cacheName) {
          console.log('[ServiceWorker] Removing old cache', key);
          return caches.delete(key);
        }
      }));
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  console.log('[ServiceWorker] Fetch', e.request.url);
  var dataUrl = '/api/query';
  if (e.request.url.indexOf(dataUrl) > -1) {
   console.log("Fetching api data");
   e.respondWith(fetch(e.request));
  } else if (e.request.url.indexOf(".mp3") > -1) {
      console.log("Got a mp3 call ", e);
      e.respondWith(
        caches.open(cacheName).then(function(cache) {
          return cache.match(e.request.url).then(function(response) {
            if (response) {
              console.log('[ServiceWorker] Found cached mp3 response: ', response);
              progress(100, 100);
              return response;
            } else {
              console.log('[ServiceWorker] Loading ', e.request);
              const request = new Request(e.request, { mode: 'no-cors' });
              return fetch(request).
                then(function(response) {
                  console.log('[ServiceWorker] Fetching mp3');
                  var contentLength  = -1;
                  /*
                  try {
                    console.log('Headers: ', response.headers);
                    contentLength = response.headers.get('content-length');
                    if (!contentLength) {
                      log.error('Content-Length response header unavailable');
                    }
                  } catch (e) {
                    console.error(e);
                  }
                  var total = parseInt(contentLength, 10);
                  */
                  var total = -1;

                  let loaded = 0;
                  console.log("[ServiceWorker] Content length: ",contentLength);
                  return response;
                  /*
                  return new Response(
                    new ReadableStream({
                      start(controller) {
                        const reader = response.body.getReader();

                        read();
                        function read() {
                          reader.read().then(({done, value}) => {
                            if (done) {
                              console.log("[ServiceWorker] Download finished.")
                              controller.close();
                              return;
                            }
                            loaded += value.byteLength;
                    //        progress(loaded, total);

                            controller.enqueue(value);
                            read();
                          }).catch(error => {
                            console.error(error);
                            controller.error(error)
                          })
                        }
                      }
                    })
                  );
                  */
                })
                .then(function(response) {
                  progress(100, 100);
                  console.log("[ServiceWorker] Putting response to cache:", response)
                  cache.put(e.request.url, response.clone());
                  return response;
                })
                .catch(error => {
                  console.error(error);
                });
            }
          })
        })
    );
  } else {
    console.log("Matching generic request "+e.request.urk+": ", caches.match(e.request.url));
    e.respondWith(
      caches.open(cacheName).then(function(cache) {
        return cache.match(e.request.url).then(function(response) {
            if (response) {
              console.log('[ServiceWorker] Found cached response: ', response);
              return response;
            } else {
              return fetch(e.request).then(response => {
                console.log("[ServiceWorker] Putting response to cache:", response)
                cache.put(e.request.url, response.clone());
                return response;
              });
            }
          })
      })
    );
  }
});


function progress(loaded, total) {
  var percent = (loaded / total * 100);
  var size = total / 1024 / 1024;
  size = Math.floor(size * 10) / 10;
  var downloaded = loaded / 1024 / 1024;
  downloaded = Math.floor(downloaded * 10) / 10;
  var msg = downloaded.toLocaleString() +
    " / " +size.toLocaleString() + " MB";

  self.clients.matchAll().then(function (clients){
    clients.forEach(function(client){
      client.postMessage({
        msg: "progress",
        text: msg,
        percent: percent
      });
    });
  });
}
