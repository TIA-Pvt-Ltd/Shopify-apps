function isModifiedClick(event) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}

function toAppPath(href) {
  try {
    const url = new URL(href, window.location.origin);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return href;
  }
}

function isInAppHref(href) {
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return false;
  }
  if (href.startsWith("/app")) return true;
  try {
    const url = new URL(href, window.location.origin);
    return url.origin === window.location.origin && url.pathname.startsWith("/app");
  } catch {
    return false;
  }
}

function eventPath(event) {
  return typeof event.composedPath === "function" ? event.composedPath() : [event.target];
}

function isSubmitClick(path) {
  return path.some((node) => {
    if (!node || typeof node.getAttribute !== "function") return false;
    const tag = node.tagName;
    const type = (node.getAttribute("type") || node.type || "").toLowerCase();
    return (tag === "BUTTON" || tag === "S-BUTTON" || tag === "INPUT") && type === "submit";
  });
}

function appPathFromEvent(event) {
  const path = eventPath(event);
  if (isSubmitClick(path)) return null;

  for (const node of path) {
    if (!node || typeof node.getAttribute !== "function") continue;
    const dataTo = node.getAttribute("data-app-to");
    if (dataTo && isInAppHref(dataTo)) return toAppPath(dataTo);
    const href = node.getAttribute("href");
    if (href && isInAppHref(href)) return toAppPath(href);
  }
  return null;
}

export function interceptAdminClicks(navigate) {
  function handleClick(event) {
    if (event.defaultPrevented || isModifiedClick(event)) return;
    const href = appPathFromEvent(event);
    if (!href) return;
    event.preventDefault();
    navigate(href);
  }

  document.addEventListener("click", handleClick, true);
  return () => document.removeEventListener("click", handleClick, true);
}
