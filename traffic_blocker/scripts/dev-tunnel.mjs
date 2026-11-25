import { spawn } from "node:child_process";
import net from "node:net";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const shop = normalizeShop(process.argv[2] || process.env.SHOP || "");
const apiPort = Number(process.env.PORT || 3000);

function normalizeShop(value) {
  if (!value) return "";
  return String(value)
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "")
    .toLowerCase();
}
const cloudflaredCandidates = [
  resolve(root, ".tools", "cloudflared.exe"),
  resolve(root, ".tools", "cloudflared"),
  "cloudflared",
];

const cloudflared = cloudflaredCandidates.find((entry) => entry === "cloudflared" || existsSync(entry));
if (!cloudflared) {
  console.error("cloudflared not found. Place it at .tools/cloudflared.exe or install it on PATH.");
  process.exit(1);
}

if (!(await canConnect(apiPort))) {
  console.error(`API is not reachable on 127.0.0.1:${apiPort}. Run \`npm run dev\` in another terminal first.`);
  process.exit(1);
}

console.log(`API is up on port ${apiPort}. Starting Cloudflare quick tunnel...`);
const child = spawn(cloudflared, ["tunnel", "--url", `http://127.0.0.1:${apiPort}`], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

let tunnelUrl = "";
let installStarted = false;

function handleChunk(chunk, stream) {
  const text = chunk.toString();
  process[stream].write(chunk);
  if (tunnelUrl) return;
  const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
  if (!match) return;
  tunnelUrl = match[0].replace(/\/$/, "");
  console.log("");
  console.log(`Tunnel ready: ${tunnelUrl}`);
  if (shop) {
    if (installStarted) return;
    installStarted = true;
    console.log(`Installing storefront embed on ${shop}...`);
    const installer = spawn(process.execPath, [resolve(root, "scripts", "install-storefront.mjs"), shop, tunnelUrl], {
      cwd: root,
      stdio: "inherit",
      windowsHide: true,
    });
    installer.on("exit", (code) => {
      if (code === 0) {
        console.log("Storefront updated. Hard-refresh the store and check Network for embed.js + /api/v1/firewall/decide.");
      } else {
        console.error(`install-storefront exited with code ${code ?? "unknown"}.`);
        console.error(`Retry: node scripts/install-storefront.mjs ${shop} ${tunnelUrl}`);
      }
      console.log("Leave this tunnel running while you test.");
    });
  } else {
    console.log("Push this origin into the live theme (required every time the hostname changes):");
    console.log(`  node scripts/install-storefront.mjs <shop.myshopify.com> ${tunnelUrl}`);
    console.log("Or restart with a shop: npm run dev:tunnel -- your-shop.myshopify.com");
    console.log("Do not edit .tools/theme expecting Shopify to pick it up.");
  }
}

child.stdout.on("data", (chunk) => handleChunk(chunk, "stdout"));
child.stderr.on("data", (chunk) => handleChunk(chunk, "stderr"));
child.on("exit", (code) => {
  process.exit(code ?? 1);
});

process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));

function canConnect(port) {
  return new Promise((resolveConnect) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    const finish = (ok) => {
      socket.destroy();
      resolveConnect(ok);
    };
    socket.setTimeout(500);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}
