import { readFile } from "node:fs/promises";
import { ipInAnyCidr, parseNetwork } from "../lib/ip.js";

export interface NetworkProfile {
  asn: number;
  organization: string;
  hosting: boolean;
  /** Network is operated as a VPN or proxy service, not general hosting. */
  vpn?: boolean;
}

/** Public ASN assignments used as a datacenter signal. They do not block traffic by themselves. */
export const NETWORK_DIRECTORY: readonly NetworkProfile[] = [
  { asn: 16509, organization: "Amazon.com, Inc.", hosting: true },
  { asn: 14618, organization: "Amazon.com, Inc.", hosting: true },
  { asn: 15169, organization: "Google LLC", hosting: true },
  { asn: 396982, organization: "Google LLC", hosting: true },
  { asn: 8075, organization: "Microsoft Corporation", hosting: true },
  { asn: 13335, organization: "Cloudflare, Inc.", hosting: true },
  { asn: 14061, organization: "DigitalOcean, LLC", hosting: true },
  { asn: 16276, organization: "OVH SAS", hosting: true },
  { asn: 24940, organization: "Hetzner Online GmbH", hosting: true },
  { asn: 20473, organization: "The Constant Company, LLC", hosting: true },
  { asn: 54113, organization: "Fastly, Inc.", hosting: true },
  { asn: 20940, organization: "Akamai International B.V.", hosting: true },
  { asn: 36351, organization: "SoftLayer Technologies Inc.", hosting: true },
  { asn: 9009, organization: "M247 Europe SRL", hosting: true },
  { asn: 133618, organization: "Trellian Pty. Limited", hosting: true, vpn: true },
  { asn: 212238, organization: "Datacamp Limited", hosting: true, vpn: true },
  { asn: 60068, organization: "Datacamp Limited", hosting: true, vpn: true },
  { asn: 136787, organization: "PacketHub S.A.", hosting: true, vpn: true },
  { asn: 215373, organization: "Delska Latvia", hosting: true, vpn: true },
  { asn: 202053, organization: "UpCloud Ltd", hosting: true, vpn: true },
  { asn: 25467, organization: "Akton d.o.o.", hosting: true, vpn: true },
  { asn: 8280, organization: "SYNAPSECOM S.A.", hosting: true, vpn: true },
  { asn: 57169, organization: "EDIS GmbH", hosting: true, vpn: true },
  { asn: 59729, organization: "ROUTE 95 LLC", hosting: true, vpn: true },
  { asn: 21100, organization: "ROUTE 95 LLC", hosting: true, vpn: true },
  { asn: 204957, organization: "ROUTE 95 LLC", hosting: true, vpn: true },
  { asn: 28099, organization: "iHosting Servicios Internet", hosting: true, vpn: true },
  { asn: 21069, organization: "Metanet AG", hosting: true, vpn: true },
  { asn: 213535, organization: "YottaSrc", hosting: true, vpn: true },
  { asn: 48894, organization: "Optimus IT", hosting: true, vpn: true },
  { asn: 39020, organization: "Comvive Servidores", hosting: true, vpn: true },
  { asn: 200307, organization: "ZYNOO Web Services", hosting: true, vpn: true },
  { asn: 30900, organization: "WebWorld", hosting: true, vpn: true },
  { asn: 60144, organization: "3W Infra", hosting: true, vpn: true },
  { asn: 59253, organization: "Leaseweb Singapore", hosting: true },
  { asn: 16265, organization: "Leaseweb", hosting: true },
  { asn: 28753, organization: "Leaseweb Deutschland", hosting: true },
  { asn: 60781, organization: "Leaseweb Netherlands", hosting: true },
  { asn: 38930, organization: "Leaseweb", hosting: true },
  { asn: 205544, organization: "Leaseweb UK", hosting: true },
  { asn: 30633, organization: "Leaseweb USA", hosting: true },
  { asn: 7203, organization: "Leaseweb USA", hosting: true },
  { asn: 19148, organization: "Leaseweb USA", hosting: true },
  { asn: 27411, organization: "Leaseweb USA", hosting: true },
  { asn: 393886, organization: "Leaseweb USA", hosting: true },
  { asn: 394380, organization: "Leaseweb USA", hosting: true },
  { asn: 395954, organization: "Leaseweb USA", hosting: true },
  { asn: 396190, organization: "Leaseweb USA", hosting: true },
  { asn: 396362, organization: "Leaseweb USA", hosting: true },
  { asn: 133752, organization: "Leaseweb Hong Kong", hosting: true },
  { asn: 134351, organization: "Leaseweb Japan", hosting: true },
  { asn: 32613, organization: "Leaseweb Canada", hosting: true },
  { asn: 136988, organization: "Leaseweb Australia", hosting: true },
  { asn: 51167, organization: "Contabo GmbH", hosting: true },
  { asn: 49981, organization: "WorldStream B.V.", hosting: true },
  { asn: 7018, organization: "AT&T Services, Inc.", hosting: false },
  { asn: 7922, organization: "Comcast Cable Communications", hosting: false },
  { asn: 3356, organization: "Lumen", hosting: false },
  { asn: 174, organization: "Cogent Communications", hosting: false },
  { asn: 701, organization: "Verizon Business", hosting: false },
  { asn: 3320, organization: "Deutsche Telekom AG", hosting: false },
  { asn: 2856, organization: "British Telecommunications PLC", hosting: false },
  { asn: 5511, organization: "Orange S.A.", hosting: false },
];

const HOSTING_ASNS = new Set(NETWORK_DIRECTORY.filter((entry) => entry.hosting).map((entry) => entry.asn));
const VPN_ASNS = new Set(NETWORK_DIRECTORY.filter((entry) => entry.vpn).map((entry) => entry.asn));

export function lookupAsn(asn: number | null): NetworkProfile | null {
  if (asn == null) return null;
  return NETWORK_DIRECTORY.find((entry) => entry.asn === asn) ?? null;
}

export function searchAsns(query: string): NetworkProfile[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...NETWORK_DIRECTORY];
  const numeric = Number(needle.replace(/^as/i, ""));
  return NETWORK_DIRECTORY.filter(
    (entry) =>
      entry.asn === numeric ||
      entry.organization.toLowerCase().includes(needle) ||
      `as${entry.asn}`.includes(needle),
  );
}

export interface IntelResult {
  vpn: boolean;
  proxy: boolean;
  tor: boolean;
  datacenter: boolean;
}

export interface IntelligenceStats {
  vpnCidrs: number;
  proxyCidrs: number;
  torCidrs: number;
  vpnAsns: number;
  hostingAsns: number;
}

export interface IntelligenceProvider {
  inspect(ip: string, asn: number | null): IntelResult;
  stats?: IntelligenceStats;
}

export class ListIntelligence implements IntelligenceProvider {
  readonly stats: IntelligenceStats;

  constructor(
    private readonly vpnCidrs: string[] = [],
    private readonly proxyCidrs: string[] = [],
    private readonly torCidrs: string[] = [],
  ) {
    this.stats = {
      vpnCidrs: vpnCidrs.length,
      proxyCidrs: proxyCidrs.length,
      torCidrs: torCidrs.length,
      vpnAsns: VPN_ASNS.size,
      hostingAsns: HOSTING_ASNS.size,
    };
  }

  inspect(ip: string, asn: number | null): IntelResult {
    const known = lookupAsn(asn);
    return {
      vpn: ipInAnyCidr(ip, this.vpnCidrs) || VPN_ASNS.has(asn ?? -1),
      proxy: ipInAnyCidr(ip, this.proxyCidrs),
      tor: ipInAnyCidr(ip, this.torCidrs),
      datacenter: known?.hosting === true || HOSTING_ASNS.has(asn ?? -1),
    };
  }
}

export async function loadCidrFile(path: string): Promise<string[]> {
  if (!path) return [];
  const text = await readFile(path, "utf8");
  const cidrs: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const value = line.trim();
    if (!value || value.startsWith("#")) continue;
    try {
      cidrs.push(parseNetwork(value).cidr);
    } catch {
      continue;
    }
  }
  return cidrs;
}
