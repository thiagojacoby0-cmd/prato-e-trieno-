/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-afac4cd2'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "pwa-maskable-512x512.png",
    "revision": "10ad6a81f8ff6ea6561ba508e7ba3a50"
  }, {
    "url": "pwa-512x512.png",
    "revision": "7b13f257adfedc6e835122a2efa59306"
  }, {
    "url": "pwa-192x192.png",
    "revision": "fa35d4d4a96dcdb3091726b8f6c21e55"
  }, {
    "url": "index.html",
    "revision": "7949038be9cdf95a3092d890e1cf24b2"
  }, {
    "url": "icon.svg",
    "revision": "e6ca988fd68d17b8c32c10ebf8e8daff"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "e06963a4d2212ced5a1f084f046c8d80"
  }, {
    "url": "app-logo.png",
    "revision": "7b13f257adfedc6e835122a2efa59306"
  }, {
    "url": "assets/workbox-window.prod.es5-Bd17z0YL.js",
    "revision": null
  }, {
    "url": "assets/index-HklYeEN1.js",
    "revision": null
  }, {
    "url": "assets/index-Dihbuala.css",
    "revision": null
  }, {
    "url": "assets/aistudio/page-2-1024x695_633aaebb.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/esta_assim_5dacd9e3.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Logo_para_Prato_e_Treino_644577ff.png",
    "revision": null
  }, {
    "url": "app-logo.png",
    "revision": "7b13f257adfedc6e835122a2efa59306"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "e06963a4d2212ced5a1f084f046c8d80"
  }, {
    "url": "pwa-192x192.png",
    "revision": "fa35d4d4a96dcdb3091726b8f6c21e55"
  }, {
    "url": "pwa-512x512.png",
    "revision": "7b13f257adfedc6e835122a2efa59306"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "10ad6a81f8ff6ea6561ba508e7ba3a50"
  }, {
    "url": "manifest.webmanifest",
    "revision": "7aafd4372c005ac1277c4df85c1ed4df"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("index.html"), {
    denylist: [/^\/api\//, /^\/uploads\//]
  }));
  workbox.registerRoute(/^https:\/\/fonts\.googleapis\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "google-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(/^https:\/\/fonts\.gstatic\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "gstatic-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');

}));
