(function () {
  if (window.__pcCustomizerOpen) return;
  window.__pcCustomizerOpen = true;

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  function qs(root, selector) {
    return root.querySelector(selector);
  }

  function customizerSrc(productId, shop, appUrl, handle, variantId) {
    var proxySrc =
      "/apps/product-customizer/customizer?product_id=" +
      encodeURIComponent(productId) +
      "&shop=" +
      encodeURIComponent(shop);
    if (handle) proxySrc += "&handle=" + encodeURIComponent(handle);
    if (variantId) proxySrc += "&variant_id=" + encodeURIComponent(variantId);
    var direct = appUrl
      ? appUrl.replace(/\/$/, "") +
        "/storefront/" +
        productId +
        "?shop=" +
        encodeURIComponent(shop) +
        (handle ? "&handle=" + encodeURIComponent(handle) : "") +
        (variantId ? "&variant_id=" + encodeURIComponent(variantId) : "")
      : "";
    return { proxy: proxySrc, direct: direct };
  }

  function readProductJson(root) {
    var script = root.querySelector("[data-product-customizer-json]");
    if (!script) return null;
    try {
      return JSON.parse(script.textContent);
    } catch (error) {
      return null;
    }
  }

  function storeProductJson(productId, handle, product) {
    if (!product) return;
    try {
      var payload = JSON.stringify(product);
      if (productId) sessionStorage.setItem("pc-product-" + productId, payload);
      if (handle) sessionStorage.setItem("pc-product-handle-" + handle, payload);
    } catch (error) {}
  }

  function sendProductToIframe(iframe, product) {
    if (!iframe || !product) return;
    try {
      iframe.contentWindow.postMessage(
        { source: "product-customizer-host", type: "SHOPIFY_PRODUCT", product: product },
        "*",
      );
    } catch (error) {}
  }

  function cartErrorMessage(body) {
    return (
      (body && (body.description || body.message)) ||
      "Unable to add the customized product to the cart."
    );
  }

  function readCartJson(response) {
    return response
      .text()
      .then(function (text) {
        try {
          return text ? JSON.parse(text) : null;
        } catch (error) {
          return null;
        }
      })
      .catch(function () {
        return null;
      });
  }

  function addCartItem(payload) {
    var raw = payload && payload.items && payload.items[0] ? payload.items[0] : payload || {};
    var id = Number(raw.id || raw.variantId);
    var quantity = Math.max(1, Number(raw.quantity) || 1);
    var properties = raw.properties || {};
    if (!id) {
      return Promise.reject(new Error("Select a product variant before adding to cart."));
    }

    var jsonBody = JSON.stringify({
      items: [{ id: id, quantity: quantity, properties: properties }],
    });
    var formBody = "id=" + encodeURIComponent(String(id)) + "&quantity=" + encodeURIComponent(String(quantity));
    Object.keys(properties).forEach(function (key) {
      if (properties[key] == null || properties[key] === "") return;
      formBody +=
        "&properties[" + encodeURIComponent(key) + "]=" + encodeURIComponent(String(properties[key]));
    });

    return fetch("/cart/add.js", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: jsonBody,
    }).then(function (response) {
      if (response.ok) return;
      return readCartJson(response).then(function (jsonError) {
        return fetch("/cart/add.js", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            Accept: "application/json",
          },
          body: formBody,
        }).then(function (formResponse) {
          if (formResponse.ok) return;
          return readCartJson(formResponse).then(function (formError) {
            throw new Error(cartErrorMessage(formError || jsonError));
          });
        });
      });
    });
  }

  function createLoader() {
    var loader = document.createElement("div");
    loader.className = "product-customizer-loader";
    loader.setAttribute("role", "status");
    loader.setAttribute("aria-live", "polite");
    loader.setAttribute("aria-busy", "true");
    loader.innerHTML =
      '<div class="product-customizer-loader__chrome" aria-hidden="true">' +
      '<div class="product-customizer-loader__topbar"><i></i><i></i><i></i></div>' +
      '<div class="product-customizer-loader__workspace">' +
      '<div class="product-customizer-loader__rail"><i></i><i></i><i></i><i></i><i></i></div>' +
      '<div class="product-customizer-loader__inspector"><i></i><i></i><i></i><b></b><b></b></div>' +
      '<div class="product-customizer-loader__canvas"><span class="product-customizer-loader__garment"></span></div>' +
      '<div class="product-customizer-loader__views"><i></i><i></i><i></i></div>' +
      "</div></div>" +
      '<div class="product-customizer-loader__stage">' +
      '<div class="product-customizer-loader__card">' +
      '<div class="product-customizer-loader__orb" aria-hidden="true">' +
      '<span class="product-customizer-loader__ring"></span>' +
      '<span class="product-customizer-loader__mark">' +
      '<svg viewBox="0 0 32 32" width="22" height="22">' +
      '<rect x="3" y="5" width="26" height="22" rx="6" fill="#0f766e"/>' +
      '<rect x="8" y="10" width="16" height="12" rx="2" fill="#ccfbf1"/>' +
      '<path d="M11 18.5l3-3.5 2.2 2.4 3.3-4.4 3.5 5.5H11z" fill="#0f766e"/>' +
      "</svg></span></div>" +
      '<p class="product-customizer-loader__kicker">Design studio</p>' +
      '<p class="product-customizer-loader__title">Opening customizer</p>' +
      '<p class="product-customizer-loader__hint">' +
      "<span>Preparing your design studio</span>" +
      "<span>Loading product mockup</span>" +
      "<span>Setting up the canvas</span>" +
      "</p>" +
      '<div class="product-customizer-loader__bar" aria-hidden="true"><span></span></div>' +
      "</div></div>";
    return loader;
  }

  function dismissLoader(loader) {
    if (!loader || loader.dataset.done === "true") return;
    loader.dataset.done = "true";
    loader.classList.add("is-done");
    loader.classList.remove("is-error");
    loader.setAttribute("aria-busy", "false");
    setTimeout(function () {
      if (loader.parentNode) loader.remove();
    }, 480);
  }

  function failLoader(loader, message) {
    if (!loader || loader.dataset.done === "true") return;
    loader.classList.add("is-error");
    loader.classList.remove("is-done");
    loader.dataset.done = "true";
    loader.setAttribute("aria-busy", "false");
    var title = loader.querySelector(".product-customizer-loader__title");
    var hint = loader.querySelector(".product-customizer-loader__hint");
    var bar = loader.querySelector(".product-customizer-loader__bar");
    if (title) title.textContent = "Unable to open customizer";
    if (hint) {
      hint.setAttribute("data-error", message || "");
      hint.textContent = message || "";
    }
    if (bar) bar.remove();
  }

  function addCloseButton(overlay, onClose) {
    if (!overlay || overlay.querySelector(".product-customizer-close")) return;
    var close = document.createElement("button");
    close.type = "button";
    close.className = "product-customizer-close";
    close.textContent = "Close";
    close.addEventListener("click", function () {
      overlay.remove();
      document.body.classList.remove("product-customizer-lock");
      if (onClose) onClose();
    });
    overlay.appendChild(close);
  }

  function iframeDocumentFailed(doc) {
    if (!doc) return false;
    var href = doc.location ? String(doc.location.href) : "";
    if (!href || href === "about:blank") return null;
    if (href.indexOf("chrome-error://") === 0) return true;
    if (doc.querySelector("#customizer-root, .customizer-shell, .customizer-error")) return false;
    var raw = String((doc.body && doc.body.textContent) || "").trim();
    if (raw.charAt(0) === "{") {
      try {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.ok === false) return true;
      } catch (error) {}
    }
    return false;
  }

  function mountIframe(target, src, overlay, fallbackSrc, productJson, onReady, onFail) {
    var iframe = document.createElement("iframe");
    iframe.title = "Product customizer";
    iframe.setAttribute("allow", "clipboard-write");
    iframe.setAttribute("referrerpolicy", "no-referrer-when-downgrade");

    var iframeReady = false;
    var pushCount = 0;
    var pushTimer = null;
    function markReady() {
      if (iframeReady) return;
      iframeReady = true;
      if (pushTimer) clearInterval(pushTimer);
      if (overlay) {
        overlay.classList.add("is-ready");
        var closeBtn = overlay.querySelector(".product-customizer-close");
        if (closeBtn) closeBtn.hidden = true;
      }
      if (onReady) onReady();
    }

    var triedFallback = false;
    function useFallback() {
      if (iframeReady || triedFallback) return;
      triedFallback = true;
      if (fallbackSrc && fallbackSrc !== iframe.src) {
        iframe.src = fallbackSrc;
        return;
      }
      if (onFail) {
        onFail("Unable to load the editor. Keep shopify app dev running, then try again.");
      }
    }

    iframe.addEventListener("error", useFallback);
    iframe.addEventListener("load", function () {
      sendProductToIframe(iframe, productJson);
      if (iframeReady) return;
      try {
        var failed = iframeDocumentFailed(iframe.contentDocument);
        if (failed === null) return;
        if (failed) {
          useFallback();
          return;
        }
      } catch (error) {
        markReady();
        return;
      }
      markReady();
    });

    window.addEventListener("message", function (event) {
      var data = event.data || {};
      if (data.source !== "product-customizer") return;

      function goToCart(url) {
        window.location.href = url || "/cart";
      }

      if (data.type === "READY") {
        markReady();
        return;
      }

      if (data.type === "CLOSE") {
        if (overlay) {
          overlay.remove();
          document.body.classList.remove("product-customizer-lock");
        }
        return;
      }

      if (data.type === "GO_TO_CART") {
        goToCart(data.url);
        return;
      }

      if (data.type === "REQUEST_PRODUCT") {
        sendProductToIframe(iframe, productJson);
        return;
      }

      if (data.type !== "ADD_TO_CART") return;
      addCartItem(data.payload)
        .then(function () {
          goToCart(data.url);
        })
        .catch(function (error) {
          window.alert(error.message || "Unable to add the customized product to the cart.");
        });
    });

    iframe.src = src;
    target.appendChild(iframe);
    sendProductToIframe(iframe, productJson);
    pushTimer = setInterval(function () {
      sendProductToIframe(iframe, productJson);
      if (++pushCount >= 8 && pushTimer) {
        clearInterval(pushTimer);
        pushTimer = null;
      }
    }, 120);

    setTimeout(function () {
      if (iframeReady) return;
      try {
        var href =
          iframe.contentDocument && iframe.contentDocument.location
            ? iframe.contentDocument.location.href
            : "";
        if (!href || href === "about:blank") useFallback();
      } catch (error) {}
    }, 8000);

    addCloseButton(overlay);

    return iframe;
  }

  function currentVariantId(root) {
    var input = document.querySelector('form[action*="/cart/add"] [name="id"]');
    return (input && input.value) || root.dataset.variantId || "";
  }

  function bindRoot(root) {
    if (!root || root.dataset.bound === "true") return;
    var button = qs(root, ".product-customizer-open");
    var mount = qs(root, ".product-customizer-mount");
    if (!button || !mount) return;
    root.dataset.bound = "true";

    var shop = root.dataset.shop;
    var productId = root.dataset.productId;
    var handle = root.dataset.productHandle || "";
    var productJson = readProductJson(root);
    storeProductJson(productId, handle, productJson);
    var mode = root.dataset.displayMode || "inline";

    function setBusy(busy) {
      root.dataset.opening = busy ? "true" : "false";
      button.disabled = busy;
      button.classList.toggle("is-busy", busy);
      button.setAttribute("aria-busy", busy ? "true" : "false");
    }

    function openCustomizer() {
      if (root.dataset.opening === "true") return;
      if (mode === "modal" && document.querySelector(".product-customizer-overlay")) return;
      setBusy(true);

      var overlay = null;
      var host = mount;
      if (mode === "modal") {
        overlay = document.createElement("div");
        overlay.className = "product-customizer-overlay";
        document.body.classList.add("product-customizer-lock");
        document.body.appendChild(overlay);
        host = overlay;
      } else {
        mount.hidden = false;
        mount.innerHTML = "";
      }

      var loader = createLoader();
      host.appendChild(loader);
      addCloseButton(overlay, function () {
        setBusy(false);
      });

      var appUrl = (root.dataset.appUrl || "").replace(/\/$/, "");
      var variantId = currentVariantId(root);
      var urls = customizerSrc(productId, shop, appUrl, handle, variantId);
      mountIframe(
        host,
        urls.proxy,
        overlay,
        urls.direct,
        productJson,
        function () {
          dismissLoader(loader);
          setBusy(false);
        },
        function (message) {
          failLoader(loader, message);
          setBusy(false);
        },
      );
    }

    button.addEventListener("click", openCustomizer);
  }

  function bindAll() {
    document.querySelectorAll(".product-customizer-block").forEach(bindRoot);
  }

  ready(function () {
    bindAll();
    new MutationObserver(bindAll).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  });
})();
