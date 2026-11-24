import net from "node:net";

const port = 3000;
const hosts = ["127.0.0.1", "::1"];
const deadline = Date.now() + 30_000;

console.log(`Waiting for the API on port ${port}...`);
while (Date.now() < deadline) {
  if (await canConnect()) {
    console.log(`API is listening on port ${port}`);
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, 200));
}
console.error(`The API did not open port ${port} within 30 seconds.`);
process.exit(1);

function canConnect() {
  return Promise.any(hosts.map((host) => probe(host))).catch(() => false);
}

function probe(host) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    const finish = (open) => {
      socket.destroy();
      if (open) resolve(true);
      else reject(new Error("closed"));
    };
    socket.setTimeout(400);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}
