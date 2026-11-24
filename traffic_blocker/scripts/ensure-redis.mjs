import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import { dirname, resolve } from "node:path";

const port = redisPort();

if (await canConnect(port)) {
  console.log(`Redis is already listening on 127.0.0.1:${port}`);
  process.exit(0);
}

const exe = findRedisServer();
if (!exe) {
  console.warn("redis-server was not found. The API will start without queues.");
  process.exit(0);
}

const child = spawn(exe, ["--bind", "127.0.0.1", "--port", String(port), "--protected-mode", "yes", "--save", "", "--appendonly", "no"], {
  cwd: dirname(exe),
  detached: true,
  stdio: "ignore",
  windowsHide: true,
});
child.unref();

const ready = await waitForPort(port, 8000);
if (!ready) {
  console.warn(`Redis did not open port ${port}. The API will start without queues.`);
  process.exit(0);
}
console.log(`Redis started on 127.0.0.1:${port}`);

function redisPort() {
  const file = resolve(process.cwd(), ".env");
  if (!existsSync(file)) return 6379;
  const match = readFileSync(file, "utf8").match(/^REDIS_URL=(.+)$/m);
  if (!match) return 6379;
  try {
    const url = new URL(match[1].trim().replace(/^["']|["']$/g, ""));
    return Number(url.port || 6379);
  } catch {
    return 6379;
  }
}

function findRedisServer() {
  const command = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnSync(command, ["redis-server"], { encoding: "utf8" });
  const found = result.stdout.split(/\r?\n/).map((line) => line.trim()).find((line) => line && existsSync(line));
  return found || null;
}

function canConnect(targetPort) {
  return new Promise((resolvePromise) => {
    const socket = net.connect({ host: "127.0.0.1", port: targetPort });
    const finish = (open) => {
      socket.destroy();
      resolvePromise(open);
    };
    socket.setTimeout(400);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

async function waitForPort(targetPort, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await canConnect(targetPort)) return true;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
  }
  return false;
}
