import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CustomizerCanvas from "../canvas/CustomizerCanvas";
import CanvasToolbar from "../canvas/CanvasToolbar";
import LayerManager from "../canvas/LayerManager";
import LeftPanel, { ToolRail } from "./LeftPanel";
import RightViews from "./RightViews";
import CartBar from "./CartBar";
import { defaultPrintArea, GOOGLE_FONTS } from "../../utils/customizer-defaults";
import { loadUploadedFontFaces } from "../../utils/uploaded-fonts";
import { colorFromVariant, colorsFromProduct, otherProductOptions, variantForColor, variantForSelections } from "../../utils/product-colors";
import { fetchStorefrontProductJson, injectedProductFromStorage, richerCatalogProduct, selectionsFromVariant } from "../../utils/catalog-product";
import { toStorefrontPreviewUrl } from "../../utils/preview-url";
import { forgetSavedDesign, readSavedDesigns, rememberSavedDesign } from "../../utils/saved-designs";
import { cartAddPayload, cartLineProperties, postShopifyCartAdd, variantNumericId } from "../../utils/cart-add";
import "../../styles/customizer.css";

const DEFAULT_TEXT = {
  text: "Your text",
  fontFamily: "Montserrat",
  fontSize: 32,
  fill: "#111111",
  stroke: "#ffffff",
  strokeWidth: 3,
  fontWeight: "normal",
  fontStyle: "normal",
  underline: false,
  linethrough: false,
  textAlign: "left",
  textTransform: "none",
  charSpacing: 0,
  lineHeight: 1.16,
  angle: 0,
  opacity: 1,
  curve: 0,
  shadowEnabled: false,
  shadowColor: "#000000",
  shadowBlur: 6,
  shadowOffsetX: 2,
  shadowOffsetY: 2,
  flipX: false,
  flipY: false,
};

function asHexColor(value, fallback) {
  const raw = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw;
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`;
  }
  return fallback;
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, options);
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.ok === false) {
    throw new Error(json.error || "Request failed.");
  }
  return json;
}

function cartUrl(shop) {
  const domain = String(shop || "").replace(/^https?:\/\//, "");
  return domain ? `https://${domain}/cart` : "/cart";
}

function goToStorefrontCart(shop) {
  const url = cartUrl(shop);
  try {
    if (window.top && window.top !== window) {
      window.top.location.href = url;
      return;
    }
  } catch {
    // Cross-origin iframe cannot assign top.location.
  }
  if (window.parent && window.parent !== window) {
    window.parent.postMessage(
      { source: "product-customizer", type: "GO_TO_CART", url },
      "*",
    );
    return;
  }
  window.location.href = url;
}

const FALLBACK_MOCKUP =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">
      <rect width="800" height="800" fill="#f8fafc"/>
      <path fill="#d1d5db" d="M250 170l95-42h110l95 42 48 74-68 28v348H270V272l-68-28z"/>
      <path fill="#e5e7eb" d="M310 270h180v300H310z"/>
    </svg>`,
  );

function isGraphicType(type) {
  return ["image", "graphic", "upload", "qr"].includes(type);
}

function graphicFromSelection(selection) {
  if (!selection || !isGraphicType(selection.type)) return null;
  return {
    opacity: selection.opacity == null ? 1 : Number(selection.opacity),
    angle: Number(selection.angle) || 0,
    flipX: Boolean(selection.flipX),
    flipY: Boolean(selection.flipY),
    fill: asHexColor(selection.fill, "") || "",
    recolorable: selection.type === "graphic" || selection.recolorable === true,
  };
}

function textFromSelection(selection) {
  if (!selection || !["text", "i-text"].includes(selection.type)) return null;
  return {
    text: selection.text || "Your text",
    fontFamily: selection.fontFamily || DEFAULT_TEXT.fontFamily,
    fontSize: selection.fontSize || DEFAULT_TEXT.fontSize,
    fill: asHexColor(selection.fill, DEFAULT_TEXT.fill),
    stroke: asHexColor(selection.stroke, DEFAULT_TEXT.stroke),
    strokeWidth:
      selection.strokeWidth == null ? DEFAULT_TEXT.strokeWidth : Number(selection.strokeWidth) || 0,
    fontWeight: selection.fontWeight || "normal",
    fontStyle: selection.fontStyle || "normal",
    underline: Boolean(selection.underline),
    linethrough: Boolean(selection.linethrough),
    textAlign: selection.textAlign || "left",
    textTransform: selection.textTransform || "none",
    charSpacing: Number(selection.charSpacing) || 0,
    lineHeight: Number(selection.lineHeight) || 1.16,
    angle: Number(selection.angle) || 0,
    opacity: selection.opacity == null ? 1 : Number(selection.opacity),
    curve: Number(selection.curve) || 0,
    shadowEnabled: Boolean(selection.shadowEnabled),
    shadowColor: asHexColor(selection.shadowColor, DEFAULT_TEXT.shadowColor),
    shadowBlur: Number(selection.shadowBlur) || 0,
    shadowOffsetX: Number(selection.shadowOffsetX) || 0,
    shadowOffsetY: Number(selection.shadowOffsetY) || 0,
    flipX: Boolean(selection.flipX),
    flipY: Boolean(selection.flipY),
  };
}

export default function CustomizerApp({
  shop,
  appUrl,
  customizer,
  product,
  assets,
  fonts,
  apiBase,
}) {
  const canvasRef = useRef(null);
  const selectionIdRef = useRef(null);
  const views = customizer?.views?.length
    ? customizer.views
    : [
        {
          id: "front",
          name: "Front",
          type: "front",
          imageUrl: product?.imageUrl,
          width: 800,
          height: 800,
          printArea: defaultPrintArea(),
        },
      ];
  const configuration = customizer?.configuration || {};
  const [activeViewId, setActiveViewId] = useState(views[0]?.id);
  const [viewStates, setViewStates] = useState({});
  const [activeTool, setActiveTool] = useState("text");
  const [mobilePanel, setMobilePanel] = useState(null);
  const [textProps, setTextProps] = useState(DEFAULT_TEXT);
  const [graphicProps, setGraphicProps] = useState({
    opacity: 1,
    angle: 0,
    flipX: false,
    flipY: false,
    fill: "",
    recolorable: true,
  });
  const [catalogProduct, setCatalogProduct] = useState(product);
  const colors = useMemo(() => colorsFromProduct(catalogProduct), [catalogProduct]);
  const extraOptions = useMemo(() => otherProductOptions(catalogProduct), [catalogProduct]);
  const [selectedVariantId, setSelectedVariantId] = useState(catalogProduct?.variants?.[0]?.id || "");
  const [selectedColor, setSelectedColor] = useState(
    () => colorFromVariant(colors, catalogProduct?.variants?.[0]) || colors[0] || null,
  );
  const [optionSelections, setOptionSelections] = useState(
    () => selectionsFromVariant(catalogProduct?.variants?.[0]),
  );
  const [quantity, setQuantity] = useState(configuration.customerOptions?.minQuantity || 1);
  const [libraryAssets, setLibraryAssets] = useState(assets || []);
  const [layers, setLayers] = useState([]);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [zoom, setZoom] = useState(1);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [publicId, setPublicId] = useState("");
  const [savedDesigns, setSavedDesigns] = useState([]);
  const [loadingSavedId, setLoadingSavedId] = useState("");

  const savedProductId = customizer?.shopifyProductId || catalogProduct?.id || product?.id || "";

  useEffect(() => {
    setSavedDesigns(readSavedDesigns(shop, savedProductId));
  }, [shop, savedProductId]);

  const activeView = views.find((view) => view.id === activeViewId) || views[0];
  const variant = (catalogProduct?.variants || []).find((item) => item.id === selectedVariantId);
  const colorImageUrl = selectedColor?.imageUrl || variant?.imageUrl || null;
  const tools = configuration.tools || {};
  const canvasWidth = activeView?.width || 800;
  const canvasHeight = activeView?.height || 800;
  const printArea = activeView?.printArea || defaultPrintArea(canvasWidth, canvasHeight);

  const priceLabel = useMemo(() => {
    const base = Number(variant?.price || configuration.pricing?.basePrice || 0);
    return base ? `$${base.toFixed(2)}` : "Add to cart";
  }, [variant, configuration.pricing]);

  const handleColorChange = (color) => {
    setSelectedColor(color);
    const nextSelections = {
      ...optionSelections,
      ...(color?.optionName ? { [color.optionName]: color.name } : {}),
    };
    setOptionSelections(nextSelections);
    const nextVariant =
      variantForSelections(catalogProduct, nextSelections) ||
      variantForColor(catalogProduct, color, selectedVariantId);
    if (nextVariant?.id) setSelectedVariantId(nextVariant.id);
  };

  const handleVariantChange = (variantId) => {
    setSelectedVariantId(variantId);
    const nextVariant = (catalogProduct?.variants || []).find((item) => item.id === variantId);
    setOptionSelections(selectionsFromVariant(nextVariant));
    const nextColor = colorFromVariant(colors, nextVariant);
    if (nextColor) setSelectedColor(nextColor);
  };

  const handleOptionChange = (name, value) => {
    const nextSelections = { ...optionSelections, [name]: value };
    setOptionSelections(nextSelections);
    const nextVariant = variantForSelections(catalogProduct, nextSelections);
    if (nextVariant?.id) {
      setSelectedVariantId(nextVariant.id);
      const nextColor = colorFromVariant(colors, nextVariant);
      if (nextColor) setSelectedColor(nextColor);
    }
  };

  function applyCatalogProduct(next) {
    if (!next) return;
    setCatalogProduct((current) => richerCatalogProduct(next, current) || next);
    const params = new URLSearchParams(window.location.search);
    const variantId = params.get("variant_id") || params.get("variantId") || "";
    const variants = next.variants || [];
    const matched =
      variants.find(
        (item) =>
          item.id === selectedVariantId ||
          item.numericId === variantId ||
          String(item.id).endsWith(`/${variantId}`),
      ) || variants[0];
    if (!matched) return;
    setSelectedVariantId((current) => (current === matched.id ? current : matched.id));
    setOptionSelections(selectionsFromVariant(matched));
    const nextColors = colorsFromProduct(next);
    const nextColor = colorFromVariant(nextColors, matched) || nextColors[0] || null;
    setSelectedColor((current) =>
      current?.id && nextColor?.id && current.id === nextColor.id ? current : nextColor,
    );
  }

  useEffect(() => {
    const injected = injectedProductFromStorage();
    const next = richerCatalogProduct(injected, product) || injected || product;
    if (next) applyCatalogProduct(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product]);

  useEffect(() => {
    let cancelled = false;
    async function hydrateCatalog() {
      const params = new URLSearchParams(window.location.search);
      const injected = injectedProductFromStorage();
      const handle = product?.handle || injected?.handle || params.get("handle") || "";
      const ajax = handle ? await fetchStorefrontProductJson(handle) : null;
      if (cancelled) return;
      const next = richerCatalogProduct(ajax, injected, product);
      if (next) applyCatalogProduct(next);
    }
    hydrateCatalog();
    function onMessage(event) {
      const data = event.data || {};
      if (data.source !== "product-customizer-host" || data.type !== "SHOPIFY_PRODUCT") return;
      if (!data.product) return;
      const next = richerCatalogProduct(data.product, injectedProductFromStorage(), product);
      if (next) applyCatalogProduct(next);
    }
    window.addEventListener("message", onMessage);
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ source: "product-customizer", type: "REQUEST_PRODUCT" }, "*");
    }
    return () => {
      cancelled = true;
      window.removeEventListener("message", onMessage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product]);

  useEffect(() => {
    if (!colors.length) return;
    if (selectedColor && colors.some((color) => color.id === selectedColor.id)) return;
    const current = (catalogProduct?.variants || []).find((item) => item.id === selectedVariantId);
    setSelectedColor(colorFromVariant(colors, current) || colors[0]);
    if (current) setOptionSelections((currentSelections) =>
      Object.keys(currentSelections || {}).length ? currentSelections : selectionsFromVariant(current),
    );
  }, [colors, catalogProduct, selectedColor, selectedVariantId]);

  useEffect(() => {
    document.body.classList.add("customizer-page");
    let frame2 = 0;
    const frame1 = requestAnimationFrame(() => {
      frame2 = requestAnimationFrame(() => {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ source: "product-customizer", type: "READY" }, "*");
        }
      });
    });
    return () => {
      cancelAnimationFrame(frame1);
      cancelAnimationFrame(frame2);
      document.body.classList.remove("customizer-page");
    };
  }, []);

  useEffect(() => {
    const id = "customizer-fonts";
    let link = document.getElementById(id);
    if (!link) {
      link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    link.href = `https://fonts.googleapis.com/css2?${GOOGLE_FONTS.map((family) => {
      if (family === "Playfair Display") {
        return `family=${encodeURIComponent(family)}:ital,wght@0,400;0,700;1,400;1,700`;
      }
      if (family === "Pacifico" || family === "Bangers") {
        return `family=${encodeURIComponent(family)}`;
      }
      return `family=${encodeURIComponent(family)}:wght@400;600;700`;
    }).join("&")}&display=swap`;
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadUploadedFontFaces(fonts).then((faces) => {
      if (cancelled) {
        faces.forEach((face) => {
          try {
            document.fonts.delete(face);
          } catch {
            // Ignore browsers that cannot remove faces.
          }
        });
        return;
      }
      canvasRef.current?.redraw?.();
    });
    return () => {
      cancelled = true;
    };
  }, [fonts]);

  useEffect(() => {
    let nudging = false;
    const arrowKeys = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
    const finishNudge = () => {
      if (!nudging) return;
      nudging = false;
      canvasRef.current?.commitNudge?.();
    };
    const onKey = (event) => {
      const tag = event.target?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || event.target?.isContentEditable;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) canvasRef.current?.redo();
        else canvasRef.current?.undo();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        canvasRef.current?.redo();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
        event.preventDefault();
        canvasRef.current?.duplicateActive();
      } else if (!typing && (event.key === "Delete" || event.key === "Backspace")) {
        event.preventDefault();
        canvasRef.current?.deleteActive();
      } else if (!typing && !event.altKey && !event.ctrlKey && !event.metaKey && arrowKeys.has(event.key)) {
        const step = event.shiftKey ? 10 : 1;
        const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
        if (canvasRef.current?.nudgeActive?.(dx, dy)) {
          event.preventDefault();
          nudging = true;
        }
      }
    };
    const onKeyUp = (event) => {
      if (arrowKeys.has(event.key)) finishNudge();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", finishNudge);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", finishNudge);
    };
  }, []);

  const persistActiveView = () => {
    if (!activeView || !canvasRef.current) return;
    setViewStates((current) => ({
      ...current,
      [activeView.id]: canvasRef.current.getJSON(),
    }));
  };

  const switchView = async (viewId) => {
    persistActiveView();
    setActiveViewId(viewId);
    const next = viewStates[viewId];
    if (next) {
      await canvasRef.current?.loadJSON(next);
    }
  };

  const endpoint = (path) => {
    const base = apiBase || `${appUrl}/api/storefront`;
    const suffix = path.startsWith("/") ? path : `/${path}`;
    const url = /^https?:\/\//.test(base)
      ? new URL(`${base}${suffix}`)
      : new URL(`${base}${suffix}`, window.location.origin);
    url.searchParams.set("shop", shop);
    return url.toString();
  };

  useEffect(() => {
    let cancelled = false;
    async function loadGraphics() {
      try {
        const url = new URL(endpoint("/assets"));
        url.searchParams.set("type", "graphic");
        const json = await apiRequest(url.toString());
        if (!cancelled && Array.isArray(json.assets)) setLibraryAssets(json.assets);
      } catch {
        // Graphics can appear after the editor is visible.
      }
    }
    loadGraphics();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase, appUrl, shop]);

  const loadSavedDesign = async (design) => {
    if (!design?.publicId) return;
    setLoadingSavedId(design.publicId);
    setError("");
    try {
      const json = await apiRequest(endpoint(`/customizations/${design.publicId}`));
      const saved = json.customization;
      const config = saved.configuration || {};
      setPublicId(saved.publicId);
      if (config.quantity) setQuantity(Number(config.quantity) || 1);
      if (config.selectedColor) {
        const nextColor =
          colors.find((color) => color.id === config.selectedColor.id) || config.selectedColor;
        handleColorChange(nextColor);
      } else if (config.selectedVariantId || saved.shopifyVariantId) {
        handleVariantChange(config.selectedVariantId || saved.shopifyVariantId);
      }
      const nextStates = {};
      (config.views || []).forEach((view) => {
        if (view?.id && view.canvas) nextStates[view.id] = view.canvas;
      });
      setViewStates(nextStates);
      const current = nextStates[activeViewId] || Object.values(nextStates)[0];
      if (current) {
        await canvasRef.current?.loadJSON(current);
      }
    } catch (err) {
      setSavedDesigns(forgetSavedDesign(shop, savedProductId, design.publicId));
      setError(err.message || "That saved design is no longer available.");
    } finally {
      setLoadingSavedId("");
    }
  };

  const collectConfiguration = async () => {
    persistActiveView();
    const currentJson = canvasRef.current?.getJSON();
    const states = { ...viewStates, [activeView?.id]: currentJson };
    return {
      selectedColor,
      selectedVariantId,
      quantity,
      views: views.map((view) => ({
        id: view.id,
        name: view.name,
        type: view.type,
        canvas: states[view.id] || null,
      })),
    };
  };

  const saveDesign = async ({ withPreview = true, withPrint = false, asNew = false, openLibrary = true } = {}) => {
    setSaving(true);
    setError("");
    try {
      const configurationPayload = await collectConfiguration();
      let previewDataUrl = null;
      let printFileDataUrl = null;
      if (withPreview) previewDataUrl = await canvasRef.current?.exportPreview();
      if (withPrint) {
        printFileDataUrl = await canvasRef.current?.exportPrintFile({
          dpi: configuration.print?.dpi || 300,
        });
      }
      const currentId = asNew ? undefined : publicId || undefined;
      const payload = {
        publicId: currentId,
        shopifyProductId: customizer.shopifyProductId,
        shopifyVariantId: selectedVariantId,
        quantity,
        configuration: configurationPayload,
        previewDataUrl,
        printFileDataUrl,
      };
      const json = currentId
        ? await apiRequest(endpoint(`/customizations/${currentId}`), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await apiRequest(endpoint("/customizations"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const saved = json.customization;
      setPublicId(saved.publicId);
      const previewUrl = toStorefrontPreviewUrl(saved.previewUrl, shop) || saved.previewUrl || "";
      setSavedDesigns(rememberSavedDesign(shop, savedProductId, { ...saved, previewUrl }));
      if (openLibrary) setActiveTool("saved");
      return saved;
    } catch (err) {
      setError(err.message || "Unable to save customization.");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const addToCart = async () => {
    setAdding(true);
    setError("");
    try {
      const variantNumeric = variantNumericId(catalogProduct, selectedVariantId);
      if (!variantNumeric) {
        setError("Select a product variant before adding to cart.");
        return;
      }
      const saved = await saveDesign({ withPreview: true, withPrint: false, openLibrary: false });
      if (!saved) return;
      const cartBody = cartAddPayload({
        variantId: variantNumeric,
        quantity,
        properties: cartLineProperties({
          publicId: saved.publicId,
          previewUrl: saved.previewUrl,
          shop,
          color: selectedColor?.name,
          view: activeView?.name,
          configuration: saved.configuration,
        }),
      });

      const onShopifyStorefront = /\.myshopify\.com$|\.shopify\.com$/.test(
        window.location.hostname,
      );
      if (onShopifyStorefront) {
        try {
          await postShopifyCartAdd(cartBody);
          window.dispatchEvent(new Event("cart:updated"));
          goToStorefrontCart(shop);
          return;
        } catch {
          // Fall through to the storefront parent / form submit.
        }
      }

      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          {
            source: "product-customizer",
            type: "ADD_TO_CART",
            payload: cartBody,
            url: cartUrl(shop),
          },
          "*",
        );
        return;
      }

      const form = document.createElement("form");
      form.method = "POST";
      form.action = `https://${shop}/cart/add`;
      form.target = "_top";
      const fields = {
        id: String(variantNumeric),
        quantity: String(quantity),
      };
      Object.entries(cartBody.items[0].properties || {}).forEach(([key, value]) => {
        fields[`properties[${key}]`] = value;
      });
      Object.entries(fields).forEach(([name, value]) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = value;
        form.appendChild(input);
      });
      document.body.appendChild(form);
      form.submit();
    } catch (err) {
      setError(err.message || "Unable to add the customized product to the cart.");
    } finally {
      setAdding(false);
    }
  };

  const handleUpload = async (file) => {
    setUploadError("");
    setUploadProgress(15);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "upload");
      formData.append("name", file.name);
      setUploadProgress(45);
      const json = await apiRequest(endpoint("/assets"), {
        method: "POST",
        body: formData,
      });
      setUploadProgress(100);
      if (json.asset) {
        setLibraryAssets((current) => [json.asset, ...current]);
        await canvasRef.current?.addImage(json.asset.url, { name: json.asset.name, customType: "upload" });
      }
    } catch (err) {
      setUploadError(err.message || "Image upload failed.");
    } finally {
      setTimeout(() => setUploadProgress(0), 400);
    }
  };

  const applyTextProps = (next) => {
    setTextProps(next);
    const active = canvasRef.current?.getActive?.();
    if (active && isGraphicType(active.type)) return;
    canvasRef.current?.updateActive({
      text: next.text,
      fontFamily: next.fontFamily,
      fontSize: next.fontSize,
      fill: next.fill,
      stroke: next.stroke,
      strokeWidth: next.strokeWidth,
      fontWeight: next.fontWeight,
      fontStyle: next.fontStyle,
      underline: next.underline,
      linethrough: next.linethrough,
      textAlign: next.textAlign,
      textTransform: next.textTransform,
      charSpacing: next.charSpacing,
      lineHeight: next.lineHeight,
      angle: next.angle,
      opacity: next.opacity,
      curve: next.curve,
      shadowEnabled: next.shadowEnabled,
      shadowColor: next.shadowColor,
      shadowBlur: next.shadowBlur,
      shadowOffsetX: next.shadowOffsetX,
      shadowOffsetY: next.shadowOffsetY,
      flipX: next.flipX,
      flipY: next.flipY,
    });
  };

  const applyGraphicProps = (next) => {
    setGraphicProps(next);
    canvasRef.current?.updateActive({
      opacity: next.opacity,
      angle: next.angle,
      flipX: next.flipX,
      flipY: next.flipY,
      fill: next.fill || "",
    });
  };

  const bindCanvas = useCallback((api) => {
    canvasRef.current = api;
  }, []);

  const syncLayersFromCanvas = (canvas) => {
    const json = canvas?.getJSON?.();
    if (!json?.objects) return;
    setLayers(
      json.objects
        .map((object) => ({
          id: object.id,
          name: object.name || object.type || "Layer",
          type: object.type,
          visible: object.visible !== false,
          locked: Boolean(object.locked),
        }))
        .reverse(),
    );
  };

  const handleAddText = (preset) => {
    const canvas = canvasRef.current;
    const payload = {
      ...textProps,
      text: typeof preset === "string" ? preset : textProps.text || "Your text",
      fill: textProps.fill || "#111111",
      stroke: textProps.stroke || "#ffffff",
      strokeWidth: Number(textProps.strokeWidth) || 0,
    };
    if (!canvas?.addText) {
      setError("The canvas is still loading. Wait a moment, then click Add text again.");
      return;
    }
    const added = canvas.addText(payload);
    if (!added) {
      setError("Could not add text. Refresh the customizer and try again.");
      return;
    }
    setError("");
    syncLayersFromCanvas(canvas);
  };

  if (!customizer?.enabled) {
    return (
      <div className="customizer-error">
        Product customizer is not enabled for this product.
      </div>
    );
  }

  const inspector = (
    <LeftPanel
      product={catalogProduct}
      variants={catalogProduct?.variants || []}
      selectedVariantId={selectedVariantId}
      onVariantChange={handleVariantChange}
      colors={colors}
      selectedColor={selectedColor}
      onColorChange={handleColorChange}
      extraOptions={extraOptions}
      optionSelections={optionSelections}
      onOptionChange={handleOptionChange}
      tools={tools}
      assets={libraryAssets}
      fonts={fonts || []}
      activeTool={activeTool}
      onToolChange={setActiveTool}
      textProps={textProps}
      onTextPropsChange={applyTextProps}
      graphicProps={graphicProps}
      onGraphicPropsChange={applyGraphicProps}
      onAddText={handleAddText}
      onAddGraphic={(url, name, meta = {}) => {
        if (!canvasRef.current?.addImage) {
          setError("The canvas is still loading. Try the graphic again in a moment.");
          return;
        }
        const fill = Object.prototype.hasOwnProperty.call(meta, "fill")
          ? meta.fill || ""
          : graphicProps.fill || "";
        setGraphicProps((current) => ({ ...current, fill, recolorable: true }));
        canvasRef.current
          .addImage(url, { name, customType: "graphic", fill: fill || null, recolorable: true })
          .then(() => {
            syncLayersFromCanvas(canvasRef.current);
          });
      }}
      onAddQr={(payload) => {
        canvasRef.current?.addQrCode(payload)?.then?.(() => syncLayersFromCanvas(canvasRef.current));
      }}
      onAddNamesNumbers={(payload) => {
        canvasRef.current?.addNamesNumbers(payload);
        syncLayersFromCanvas(canvasRef.current);
      }}
      onApplyIdea={async (idea) => {
        const canvas = canvasRef.current;
        if (!canvas) {
          setError("The canvas is still loading. Try the idea again in a moment.");
          return;
        }
        const area = canvas.getPrintArea?.() || { x: 80, y: 80, width: 400, height: 400 };
        const layers = typeof idea.layers === "function" ? idea.layers(area) : [];
        for (const layer of layers) {
          if (layer.kind === "names") canvas.addNamesNumbers(layer);
          else if (layer.kind === "graphic" && layer.url) await canvas.addImage(layer.url, layer);
          else canvas.addText(layer);
        }
        setError("");
        setActiveTool("text");
        syncLayersFromCanvas(canvas);
      }}
      onUpload={handleUpload}
      uploadProgress={uploadProgress}
      uploadError={uploadError}
      savedDesigns={savedDesigns}
      activeSavedId={publicId}
      loadingSavedId={loadingSavedId}
      onLoadSaved={loadSavedDesign}
      onRemoveSaved={(id) => {
        setSavedDesigns(forgetSavedDesign(shop, savedProductId, id));
        if (publicId === id) setPublicId("");
      }}
      onSaveCopy={() => saveDesign({ withPreview: true, asNew: true })}
    />
  );

  const layersPanel = (
    <div className="panel-section">
      <h2>Layers</h2>
      <LayerManager
        layers={layers}
        onSelect={(id) => canvasRef.current?.selectLayer(id)}
        onLayer={(action, id) => canvasRef.current?.layer(action, id)}
        onLock={(id) => canvasRef.current?.toggleLock(id)}
        onHide={(id) => canvasRef.current?.toggleVisible(id)}
        onDelete={(id) => canvasRef.current?.deleteLayer(id)}
      />
    </div>
  );

  return (
    <div className={`customizer-shell ${mobilePanel ? "sheet-open" : ""}`}>
      <header className="customizer-topbar">
        <div className="topbar-brand">
          <span>Product customizer</span>
          <strong>{catalogProduct?.title || product?.title || "Customize product"}</strong>
        </div>
        {colors.length ? (
          <div className="topbar-swatches">
            <p>Color</p>
            <div className="swatches">
              {colors.map((color) => (
                <button
                  key={color.id || color.hex}
                  type="button"
                  className={selectedColor?.id === color.id ? "swatch active" : "swatch"}
                  style={{
                    backgroundColor: color.hex,
                    backgroundImage: color.imageUrl ? `url(${color.imageUrl})` : undefined,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                  title={color.name}
                  aria-label={color.name}
                  onClick={() => handleColorChange(color)}
                />
              ))}
            </div>
          </div>
        ) : null}
        <CartBar
          quantity={quantity}
          onQuantityChange={setQuantity}
          price={priceLabel}
          saving={saving}
          adding={adding}
          error={error}
          onSave={() => saveDesign({ withPreview: true })}
          onAddToCart={addToCart}
          onClose={
            typeof window !== "undefined" && window.parent && window.parent !== window
              ? () => {
                  window.parent.postMessage({ source: "product-customizer", type: "CLOSE" }, "*");
                }
              : undefined
          }
          minQuantity={configuration.customerOptions?.minQuantity || 1}
          maxQuantity={configuration.customerOptions?.maxQuantity || 99}
        />
      </header>

      <div className="customizer-workspace">
        <ToolRail
          tools={tools}
          activeTool={activeTool}
          onToolChange={setActiveTool}
        />
        {inspector}
        <main className="customizer-center">
          <CanvasToolbar
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            zoom={zoom}
            onUndo={() => canvasRef.current?.undo()}
            onRedo={() => canvasRef.current?.redo()}
            onZoom={(value) => {
              const next = Math.max(0.4, Math.min(2.5, value));
              setZoom(next);
              canvasRef.current?.zoom(next);
            }}
            onDelete={() => canvasRef.current?.deleteActive()}
            onDuplicate={() => canvasRef.current?.duplicateActive()}
            onAlign={(direction) => canvasRef.current?.align(direction)}
          />
          <CustomizerCanvas
            ref={bindCanvas}
            width={canvasWidth}
            height={canvasHeight}
            backgroundImage={
              colorImageUrl || activeView?.imageUrl || catalogProduct?.imageUrl || product?.imageUrl || FALLBACK_MOCKUP
            }
            printArea={printArea}
            allowOverflow={Boolean(configuration.customerOptions?.allowOverflow)}
            productColor={selectedColor?.imageUrl ? null : selectedColor?.hex}
            colorMode={configuration.colorMode || "tint"}
            colorImageUrl={colorImageUrl}
            onLayersChange={setLayers}
            onHistoryChange={setHistory}
            onSelectionChange={(selection) => {
              const nextText = textFromSelection(selection);
              if (nextText) setTextProps(nextText);
              const nextGraphic = graphicFromSelection(selection);
              if (nextGraphic) setGraphicProps(nextGraphic);

              const id = selection?.id || null;
              if (id === selectionIdRef.current) return;
              selectionIdRef.current = id;
              if (!id) return;
              if (nextText) setActiveTool("text");
              else if (nextGraphic) {
                setActiveTool(
                  selection.type === "qr" ? "qr" : selection.type === "upload" ? "upload" : "graphic",
                );
              }
            }}
          />
        </main>
        <div className="customizer-right-stack">
          <RightViews views={views} activeViewId={activeView?.id} onSelect={switchView} />
          {layersPanel}
        </div>
      </div>

      <nav className="mobile-toolbar">
        <button type="button" onClick={() => setMobilePanel(mobilePanel === "tools" ? null : "tools")}>
          Tools
        </button>
        <button type="button" onClick={() => setMobilePanel(mobilePanel === "views" ? null : "views")}>
          Views
        </button>
        <button type="button" onClick={() => setMobilePanel(mobilePanel === "layers" ? null : "layers")}>
          Layers
        </button>
      </nav>
      {mobilePanel ? (
        <div className="bottom-sheet">
          <button type="button" className="sheet-close" onClick={() => setMobilePanel(null)}>
            Close
          </button>
          {mobilePanel === "tools" ? inspector : null}
          {mobilePanel === "views" ? (
            <RightViews views={views} activeViewId={activeView?.id} onSelect={switchView} />
          ) : null}
          {mobilePanel === "layers" ? layersPanel : null}
        </div>
      ) : null}
    </div>
  );
}
