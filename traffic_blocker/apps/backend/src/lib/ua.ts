export interface UserAgentFacts {
  browser: string;
  device: string;
  os: string;
  missing: boolean;
}

export function parseUserAgent(userAgent: string): UserAgentFacts {
  const ua = userAgent.trim();
  if (!ua) return { browser: "unknown", device: "unknown", os: "unknown", missing: true };
  const os = /windows nt/i.test(ua)
    ? "Windows"
    : /android/i.test(ua)
      ? "Android"
      : /iphone|ipad|ios/i.test(ua)
        ? "iOS"
        : /mac os x/i.test(ua)
          ? "macOS"
          : /linux/i.test(ua)
            ? "Linux"
            : "other";
  const device = /ipad|tablet/i.test(ua) ? "tablet" : /mobile|iphone|android/i.test(ua) ? "mobile" : "desktop";
  const browser = /edg\//i.test(ua)
    ? "Edge"
    : /chrome\//i.test(ua) && !/chromium/i.test(ua)
      ? "Chrome"
      : /firefox\//i.test(ua)
        ? "Firefox"
        : /safari\//i.test(ua) && !/chrome\//i.test(ua)
          ? "Safari"
          : /bot|crawler|spider/i.test(ua)
            ? "bot"
            : "other";
  return { browser, device, os, missing: false };
}
