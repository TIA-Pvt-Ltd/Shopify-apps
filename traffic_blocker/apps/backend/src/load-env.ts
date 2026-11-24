import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Load the repo .env into process.env. Existing non-empty variables win. */
export function loadLocalEnv(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [resolve(here, "../../../.env"), resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")];
  const file = candidates.find((candidate) => existsSync(candidate));
  if (!file) return;
  for (const rawLine of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (process.env[key]) continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
