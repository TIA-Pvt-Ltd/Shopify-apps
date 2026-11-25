import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const dataDir = resolve(root, "data");
mkdirSync(dataDir, { recursive: true });

function toCidr(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  if (trimmed.includes("/")) return trimmed;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(trimmed)) return `${trimmed}/32`;
  return null;
}

function uniqueCidrs(values) {
  return [...new Set(values.map(toCidr).filter(Boolean))].sort();
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "traffic-blocker-feed-updater/1.0" },
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
}

function writeFeed(filename, header, cidrs) {
  const body = [`# ${header}`, `# updated ${new Date().toISOString()}`, `# count ${cidrs.length}`, ...cidrs].join("\n") + "\n";
  const path = resolve(dataDir, filename);
  writeFileSync(path, body, "utf8");
  console.log(`Wrote ${filename} (${cidrs.length} ranges)`);
  return path;
}

const torText = await fetchText("https://check.torproject.org/torbulkexitlist");
const torCidrs = uniqueCidrs(torText.split(/\r?\n/));
writeFeed("tor-ipv4.txt", "Tor exit nodes from check.torproject.org/torbulkexitlist", torCidrs);

// Keep this lean: firehol_proxies.netset is multi-million and too large for in-process matching.
const proxySources = [
  "https://iplists.firehol.org/files/proxylists.ipset",
  "https://iplists.firehol.org/files/ri_web_proxies.ipset",
  "https://iplists.firehol.org/files/xroxy.ipset",
];
const proxyCidrs = [];
for (const url of proxySources) {
  try {
    const text = await fetchText(url);
    const lines = text.split(/\r?\n/).filter((line) => line && !line.startsWith("#") && !line.startsWith("create ") && !line.startsWith("add "));
    // firehol ipset lines look like: add proxylists 1.2.3.4
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("create ")) continue;
      const match = trimmed.match(/^(?:add\s+\S+\s+)?(\d{1,3}(?:\.\d{1,3}){3})(?:\/(\d{1,2}))?$/);
      if (match) proxyCidrs.push(match[2] ? `${match[1]}/${match[2]}` : `${match[1]}/32`);
    }
    console.log(`Fetched proxy source ${url}`);
  } catch (error) {
    console.warn(`Skipped proxy source ${url}: ${error instanceof Error ? error.message : error}`);
  }
}
if (proxyCidrs.length === 0) {
  throw new Error("No proxy ranges downloaded");
}
writeFeed("proxy-ipv4.txt", "Open proxy / SOCKS ranges from firehol blocklist-ipsets", uniqueCidrs(proxyCidrs));
console.log("Done. Restart the API (or let tsx reload) to load the new feeds.");
