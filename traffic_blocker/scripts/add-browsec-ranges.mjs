import { readFileSync, appendFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { Resolver } from "node:dns/promises";

const file = resolvePath("data/vpn-ipv4.txt");
const existing = new Set(readFileSync(file, "utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
const response = await fetch("https://browsec.com/api/v1/servers");
const catalog = await response.json();
const hosts = new Set();
for (const country of Object.values(catalog.countries ?? {})) {
  for (const key of ["servers", "premium_servers"]) {
    for (const server of country[key] ?? []) {
      if (server.host) hosts.add(server.host);
    }
  }
}
const dns = new Resolver();
dns.setServers(["1.1.1.1", "8.8.8.8"]);
const added = [];
for (const host of hosts) {
  try {
    const addresses = await dns.resolve4(host);
    for (const address of addresses) {
      const cidr = `${address}/32`;
      if (!existing.has(cidr) && !existing.has(address)) {
        existing.add(cidr);
        added.push(cidr);
      }
    }
  } catch {
    // A published hostname can fail to resolve. Skip it.
  }
}
if (added.length) appendFileSync(file, `\n# Browsec published servers\n${added.join("\n")}\n`);
console.log(`hosts ${hosts.size} added ${added.length}`);
