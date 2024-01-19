const FILES_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/style.css',
  '/index.js',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  'https://cdn.jsdelivr.net/npm/chart.js@2.8.0',
  'https://stackpath.bootstrapcdn.com/font-awesome/4.7.0/css/font-awesome.min.css'
];
  
const cacheName = "cache-v1";

self.addEventListener("install", event => {
  console.log("SW installed.");
  event.waitUntil(
    caches
    .open(cacheName)
    .then(cache => {
      cache.addAll(FILES_TO_CACHE);
      console.log("SW caching.");
    })
    .then(self.skipWaiting())
    .catch(err => console.log(err))
  );
});
  
self.addEventListener("activate", event => {
  console.log("SW activated");
  event.waitUntil(
    caches.keys()
    .then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== cacheName) {
            console.log("SW removing old cache", cache);
            return caches.delete(cache);
          }  
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  console.log("SW fetching.");
  const req = event.request;  
  // handle runtime requests for data from /api routes
  if (req.url.includes("/api/transaction")) {
    // network first, fallback to cache
    event.respondWith(
      fetch(req)
      .then(res => {
        const resClone = res.clone();
        caches
        .open(cacheName)
        .then(
          cache => {
            cache.put(req, resClone);
          });
        return res;     
      })
      .catch(err => { 
          caches.match(req);
          console.log(err);
      })
    )
  } else {   
    // use cache first for all other requests for performance
    event.respondWith(
      caches.match(req)
      .then(
        cachedResponse => {
          if (cachedResponse) { return cachedResponse; }
          // request is not in cache. make network request and cache the response
          return caches
          .open(cacheName)
          .then(
            cache => fetch(req)
            .then(res => cache.put(req, res.clone()))
            .catch(err => console.log(err))
          );
        }
      )
    );
  }
});


self.addEventListener("sync", event => {
  console.log("SW background syncing.");
  if (event.tag === "onlineSync") {
    event.waitUntil(
      syncRecords()
    );
  }
});

async function syncRecords() {  
  const dbReq = indexedDB.open("offTransactions");
  dbReq.onsuccess = e => {
    const db = e.target.result;
    getTrans(db);
  }
}

function getTrans(db) {
  //Transaction 1 - Get records from IDB and update remote DB
  const getTrans = db.transaction(["offTransactions"], "readonly");
    getTrans.onerror = err => console.log(err);
    getTrans.oncomplete = upd => console.log("Database updated", upd);
  const offTrans = getTrans.objectStore("offTransactions");
    offTrans.onerror = err => console.log(err);
  const getReq = offTrans.getAll();
    getReq.onsuccess = e => {
      const transactions = e.target.result;
      return fetch("/api/transaction/bulk", {
        method: 'POST',
        body: JSON.stringify(transactions),
        headers: { 'Content-Type': 'application/json' }
      })
      .then(() => console.log("Transactions posted.", transactions))
      .then(clrTrans(db))
      .catch(err => console.log(err));
    };
    getReq.onerror = err => console.log("Request failed.", err);
}

function clrTrans(db) {
  //Transaction 2 - Clear IDB
  const clrTrans = db.transaction(["offTransactions"], "readwrite");
    clrTrans.onerror = err => console.log(err);
    clrTrans.oncomplete = res => console.log("IDB cleared.", res);
  const offTrans2 = clrTrans.objectStore("offTransactions");
    offTrans2.onerror = err => console.log(err);
  const clrReq = offTrans2.clear();
    clrReq.onsuccess = evt => console.log("Request successful.", evt);
    clrReq.onerror = err => console.log("Request failed.", err); 
}