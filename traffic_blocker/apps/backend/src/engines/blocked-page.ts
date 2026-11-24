import type { BlockedPageContent } from "@traffic-blocker/shared-types";
import { DEFAULT_BLOCKED_PAGE } from "@traffic-blocker/shared-types";

const FONTS = {
  system: "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
  serif: "Iowan Old Style, Palatino Linotype, Palatino, serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
} as const;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeHttps(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function renderBlockedPage(config: BlockedPageContent, countryCode?: string | null): string {
  const background = /^#[0-9a-fA-F]{6}$/.test(config.backgroundColor) ? config.backgroundColor : DEFAULT_BLOCKED_PAGE.backgroundColor;
  const mode = config.mode ?? "generated";
  if (mode === "blank") return blankDocument(background);
  if (mode === "custom") return customDocument(config.customHtml ?? "", background);
  if (mode === "redirect") {
    const target = safeHttps(config.redirectUrl);
    if (target) return redirectDocument(target, background);
  }
  return generatedDocument(config, countryCode, background);
}

function generatedDocument(config: BlockedPageContent, countryCode: string | null | undefined, background: string): string {
  const localized = countryCode
    ? config.countryMessages.find((message) => message.countryCode.toUpperCase() === countryCode.toUpperCase())
    : undefined;
  const heading = escapeHtml(localized?.heading || config.heading || DEFAULT_BLOCKED_PAGE.heading);
  const description = escapeHtml(localized?.description || config.description || DEFAULT_BLOCKED_PAGE.description);
  const text = /^#[0-9a-fA-F]{6}$/.test(config.textColor) ? config.textColor : DEFAULT_BLOCKED_PAGE.textColor;
  const font = FONTS[config.fontFamily] ?? FONTS.system;
  const logo = safeHttps(config.logoUrl);
  const image = safeHttps(config.imageUrl);
  const support = safeHttps(config.supportUrl);
  const redirect = safeHttps(config.redirectUrl);
  const email = config.contactEmail && /^[^\s@]+@[^\s@]+$/.test(config.contactEmail) ? config.contactEmail : "";
  const refresh = config.autoRedirect && redirect ? `<meta http-equiv="refresh" content="0;url=${escapeHtml(redirect)}">` : "";
  const scheme = isDark(background) ? "dark" : "light";
  const actions = [
    email ? `<a class="tb-button" href="mailto:${escapeHtml(email)}">Email support</a>` : "",
    support ? `<a class="tb-button tb-button-quiet" href="${escapeHtml(support)}">Visit support</a>` : "",
    redirect ? `<a class="tb-button" href="${escapeHtml(redirect)}">Continue</a>` : "",
  ].filter(Boolean).join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  ${refresh}
  <title>${heading}</title>
  <style>
    :root { color-scheme: ${scheme}; }
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; }
    body {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 32px 20px;
      background:
        radial-gradient(900px 420px at 50% 0%, color-mix(in srgb, ${text} 14%, transparent), transparent 70%),
        ${background};
      color: ${text};
      font-family: ${font};
    }
    .tb-card {
      width: min(440px, 100%);
      padding: 40px 36px 32px;
      border-radius: 28px;
      text-align: center;
      background: color-mix(in srgb, ${text} 7%, ${background});
      border: 1px solid color-mix(in srgb, ${text} 16%, transparent);
      box-shadow: 0 30px 80px color-mix(in srgb, #020617 35%, transparent);
    }
    .tb-mark {
      width: 64px;
      height: 64px;
      margin: 0 auto 22px;
      display: grid;
      place-items: center;
      border-radius: 20px;
      color: ${text};
      background: color-mix(in srgb, ${text} 10%, transparent);
      border: 1px solid color-mix(in srgb, ${text} 16%, transparent);
    }
    .tb-logo, .tb-image { display: block; margin: 0 auto 20px; }
    .tb-logo { max-width: 148px; max-height: 56px; object-fit: contain; }
    .tb-image { width: 100%; max-height: 180px; object-fit: cover; border-radius: 16px; }
    h1 {
      margin: 0;
      font-size: clamp(1.75rem, 4vw, 2.15rem);
      line-height: 1.15;
      letter-spacing: -0.03em;
      font-weight: 650;
    }
    .tb-copy {
      margin: 14px auto 0;
      max-width: 34ch;
      font-size: 1.05rem;
      line-height: 1.65;
      color: color-mix(in srgb, ${text} 78%, ${background});
    }
    .tb-actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-top: 28px; }
    .tb-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 42px;
      padding: 0 16px;
      border-radius: 999px;
      text-decoration: none;
      font-size: 0.95rem;
      font-weight: 650;
      background: ${text};
      color: ${background};
    }
    .tb-button-quiet {
      background: transparent;
      color: ${text};
      border: 1px solid color-mix(in srgb, ${text} 28%, transparent);
    }
    .tb-button:focus-visible { outline: 2px solid ${text}; outline-offset: 3px; }
  </style>
</head>
<body>
  <main class="tb-card">
    <div class="tb-mark" aria-hidden="true">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <rect x="5" y="11" width="14" height="9" rx="2"></rect>
        <path d="M8 11V8a4 4 0 0 1 8 0v3"></path>
      </svg>
    </div>
    ${logo ? `<img class="tb-logo" src="${escapeHtml(logo)}" alt="">` : ""}
    ${image ? `<img class="tb-image" src="${escapeHtml(image)}" alt="">` : ""}
    <h1>${heading}</h1>
    <p class="tb-copy">${description}</p>
    ${actions ? `<div class="tb-actions">${actions}</div>` : ""}
  </main>
</body>
</html>`;
}

function blankDocument(background: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title> </title>
  <style>html, body { margin: 0; min-height: 100%; background: ${background}; }</style>
</head>
<body></body>
</html>`;
}

function customDocument(html: string, background: string): string {
  const source = html.replace(/\0/g, "").trim();
  if (!source) return blankDocument(background);
  if (/<!doctype|<html[\s>]/i.test(source)) return source;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title> </title>
  <style>body { margin: 0; background: ${background}; }</style>
</head>
<body>
${source}
</body>
</html>`;
}

function redirectDocument(target: string, background: string): string {
  const safe = escapeHtml(target);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <meta http-equiv="refresh" content="0;url=${safe}">
  <title>Redirecting</title>
  <style>body { margin: 0; min-height: 100vh; background: ${background}; }</style>
</head>
<body><a href="${safe}">Continue</a></body>
</html>`;
}

function isDark(hex: string): boolean {
  const value = Number.parseInt(hex.slice(1), 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return (red * 299 + green * 587 + blue * 114) / 1000 < 150;
}
