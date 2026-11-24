import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, "../../extensions/traffic-protection/assets/traffic-blocker.js");
const target = resolve(here, "dist/embed.js");
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, readFileSync(source));
console.log("storefront embed copied");
