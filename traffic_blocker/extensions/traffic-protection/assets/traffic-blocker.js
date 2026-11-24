(function () {
  if (window.Shopify && window.Shopify.designMode) return;
  installAnalyticsGate();

  function installAnalyticsGate() {
    var state = "hold";
    var tasks = [];
    function analyticsTarget(value) {
      var url = String(value || "");
      return /monorail-edge\.shopifysvc\.com|\/\.well-known\/shopify\/monorail\/|(?:^|\/)api\/collect(?:\?|#|$)|shop_events_listener|shopify-perf-kit|web-pixels-manager|google-analytics\.com|googletagmanager\.com|googleadservices\.com|doubleclick\.net|connect\.facebook\.net|facebook\.com\/tr|bat\.bing\.com|analytics\.tiktok\.com|snap\.licdn\.com|px\.ads\.linkedin\.com|ct\.pinterest\.com|static\.ads-twitter\.com/i.test(url);
    }
    function release() {
      if (state === "open") return;
      state = "open";
      var pending = tasks.splice(0);
      for (var i = 0; i < pending.length; i++) {
        try { pending[i](); } catch (error) { /* a held pixel must not break the store */ }
      }
    }
    window.__tbAnalytics = { release: release };

    var originalFetch = window.fetch;
    if (typeof originalFetch === "function") {
      window.fetch = function (input) {
        var url = typeof input === "string" ? input : (input && input.url) || "";
        if (!analyticsTarget(url)) return originalFetch.apply(this, arguments);
        if (state === "open") return originalFetch.apply(this, arguments);
        var caller = this;
        var args = arguments;
        return new Promise(function (resolve, reject) {
          tasks.push(function () { originalFetch.apply(caller, args).then(resolve, reject); });
        });
      };
    }

    if (navigator.sendBeacon) {
      var originalBeacon = navigator.sendBeacon.bind(navigator);
      navigator.sendBeacon = function (url, data) {
        if (!analyticsTarget(url)) return originalBeacon(url, data);
        if (state === "open") return originalBeacon(url, data);
        tasks.push(function () { originalBeacon(url, data); });
        return true;
      };
    }

    var xhrOpen = XMLHttpRequest.prototype.open;
    var xhrSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__tbUrl = url;
      return xhrOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      if (!analyticsTarget(this.__tbUrl)) return xhrSend.apply(this, arguments);
      if (state === "open") return xhrSend.apply(this, arguments);
      var xhr = this;
      var args = arguments;
      tasks.push(function () { xhrSend.apply(xhr, args); });
    };

    function scriptSource(node) {
      if (!node || node.tagName !== "SCRIPT") return "";
      return node.getAttribute("src") || node.src || "";
    }
    function holdScript(node, insert) {
      if (!analyticsTarget(scriptSource(node))) return false;
      if (state === "open") return false;
      tasks.push(insert);
      return true;
    }
    var originalAppend = Node.prototype.appendChild;
    Node.prototype.appendChild = function (node) {
      var parent = this;
      if (holdScript(node, function () { originalAppend.call(parent, node); })) return node;
      return originalAppend.call(this, node);
    };
    var originalInsert = Node.prototype.insertBefore;
    Node.prototype.insertBefore = function (node, child) {
      var parent = this;
      if (holdScript(node, function () { originalInsert.call(parent, node, child); })) return node;
      return originalInsert.call(this, node, child);
    };

    function quarantine(node) {
      var src = scriptSource(node);
      if (!analyticsTarget(src) || node.getAttribute("data-tb-held") === "1") return;
      node.setAttribute("data-tb-held", "1");
      node.type = "text/plain";
      node.removeAttribute("src");
      if (node.parentNode) node.parentNode.removeChild(node);
      tasks.push(function () {
        var fresh = document.createElement("script");
        fresh.src = src;
        fresh.async = true;
        (document.head || document.documentElement).appendChild(fresh);
      });
    }
    var observer = new MutationObserver(function (records) {
      if (state === "open") return;
      records.forEach(function (record) {
        record.addedNodes.forEach(function (node) {
          if (node && node.tagName === "SCRIPT") quarantine(node);
        });
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    var imageSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
    if (imageSrc && imageSrc.set && imageSrc.get) {
      Object.defineProperty(HTMLImageElement.prototype, "src", {
        configurable: true,
        enumerable: imageSrc.enumerable,
        get: function () { return imageSrc.get.call(this); },
        set: function (value) {
          if (!analyticsTarget(value) || state === "open") return imageSrc.set.call(this, value);
          var img = this;
          tasks.push(function () { imageSrc.set.call(img, value); });
        }
      });
    }
  }

  var script = document.currentScript || document.querySelector("script[data-shop]");
  if (!script) return;
  var shop = script.getAttribute("data-shop");
  var endpoint = script.getAttribute("data-endpoint");
  var proxy = script.getAttribute("data-proxy");
  if (!endpoint && script.src) {
    try { endpoint = new URL(script.src).origin; } catch (error) { endpoint = ""; }
  }
  if (!shop || !endpoint) return;

  var blocked = false;
  var challengeShown = false;
  var clearance = "";
  try { clearance = sessionStorage.getItem("tb_clearance") || ""; } catch (error) { clearance = ""; }

  function requestBody(watch) {
    return JSON.stringify({
      shop: shop,
      path: location.pathname,
      userAgent: navigator.userAgent,
      language: navigator.language,
      webdriver: navigator.webdriver === true,
      referrer: document.referrer,
      clearance: clearance,
      watch: watch === true
    });
  }

  var tunnel = endpoint.replace(/\/$/, "") + "/api/v1/firewall/decide";
  var sameOrigin = proxy ? location.origin + proxy.replace(/\/$/, "") + "/decide" : "";

  function post(url, timeout, body) {
    if (!url) return Promise.reject(new Error("missing"));
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, timeout) : null;
    return fetch(url, {
      method: "POST",
      headers: { "content-type": "text/plain;charset=UTF-8" },
      body: body,
      cache: "no-store",
      signal: controller ? controller.signal : undefined
    }).then(function (response) {
      if (!response.ok) throw new Error("status");
      return response.json();
    }).finally(function () {
      if (timer) clearTimeout(timer);
    });
  }

  function ask(watch) {
    var body = requestBody(watch);
    var attempt = sameOrigin
      ? post(sameOrigin, 2500, body).catch(function () { return post(tunnel, 8000, body); })
      : post(tunnel, 8000, body);
    return attempt.then(handle).catch(function () {
      // Native mode cannot fail closed when the app is unreachable.
      // A page that is already denied stays denied if a later check cannot connect.
      if (!blocked) reveal();
    });
  }

  function handle(body) {
    var data = body && body.data;
    if (!data) {
      if (!blocked) reveal();
      return;
    }
    try {
      sessionStorage.setItem("tb_decision", data.action);
      sessionStorage.setItem("tb_request_id", data.requestId || "");
    } catch (error) { /* storage can be blocked */ }
    if (data.action === "block" || data.action === "rate_limit") {
      blocked = true;
      showBlocked(data.blockedPageHtml || fallbackPage());
      return;
    }
    if (data.action === "challenge" && data.challengeNonce) {
      blocked = false;
      reveal(false);
      if (!challengeShown) {
        challengeShown = true;
        showChallenge(endpoint, shop, data.challengeNonce);
      }
      return;
    }
    blocked = false;
    reveal(true);
  }

  function releaseAnalytics() {
    if (window.__tbAnalytics) window.__tbAnalytics.release();
  }

  function reveal(allowAnalytics) {
    blocked = false;
    var root = document.documentElement;
    root.classList.remove("tb-blocked", "tb-hold");
    root.classList.add("tb-decided");
    var frame = document.getElementById("tb-block-frame");
    if (frame) frame.remove();
    if (allowAnalytics !== false) releaseAnalytics();
  }

  function showBlocked(html) {
    var root = document.documentElement;
    root.classList.add("tb-decided", "tb-blocked", "tb-hold");
    var frame = document.getElementById("tb-block-frame");
    if (!frame) {
      frame = document.createElement("iframe");
      frame.id = "tb-block-frame";
      frame.setAttribute("title", "Access restricted");
      frame.style.cssText = "position:fixed;top:0;right:0;bottom:0;left:0;width:100%;height:100%;border:0;z-index:2147483647;background:#0f172a;";
      root.appendChild(frame);
    }
    if (frame.getAttribute("srcdoc") !== html) frame.setAttribute("srcdoc", html);
  }

  function fallbackPage() {
    // Shopify injects app-block markup before a literal body closing tag, even inside this script.
    var end = "<" + "/main><" + "/body><" + "/html>";
    return "<!doctype html><html><body style=\"margin:0;min-height:100vh;display:grid;place-items:center;background:#0f172a;color:#f8fafc;font-family:sans-serif\"><main style=\"text-align:center;padding:24px\"><h1 style=\"margin:0\">Access Restricted</h1><p>Sorry, this store is not available in your region.</p>" + end;
  }

  function showChallenge(endpoint, shop, nonce) {
    var panel = document.createElement("div");
    panel.setAttribute("role", "dialog");
    panel.style.cssText = "position:fixed;inset:0;background:rgba(15,23,42,.72);display:grid;place-items:center;z-index:2147483646;";
    panel.innerHTML = '<div style="background:#fff;color:#111;padding:24px;border-radius:12px;max-width:420px;font-family:sans-serif"><h2 style="margin:0 0 8px">Confirm you are visiting</h2><p>This is a soft challenge, not a guarantee that automation is absent.</p><button type="button">Continue</button></div>';
    document.body.appendChild(panel);
    var button = panel.querySelector("button");
    if (!button) return;
    button.addEventListener("click", function () {
      fetch(endpoint.replace(/\/$/, "") + "/api/v1/firewall/challenge", {
        method: "POST",
        headers: { "content-type": "text/plain;charset=UTF-8" },
        body: JSON.stringify({ shop: shop, path: location.pathname, userAgent: navigator.userAgent, nonce: nonce })
      }).then(function (response) { return response.json(); }).then(function (body) {
        var data = body && body.data;
        if (data && data.clearance) {
          clearance = data.clearance;
          sessionStorage.setItem("tb_clearance", data.clearance);
          sessionStorage.setItem("tb_decision", "allow");
          panel.remove();
          challengeShown = false;
          releaseAnalytics();
        }
      });
    });
  }

  ask(false);
  setInterval(function () { ask(true); }, 3000);
})();
