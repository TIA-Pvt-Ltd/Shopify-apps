import { getCountry } from "@traffic-blocker/country-data";

export interface GeoIpResult {
  countryCode: string | null;
  continentCode: string | null;
  asn: number | null;
  asnOrg: string | null;
  configured: boolean;
}

export interface GeoIpProvider {
  lookup(ip: string): GeoIpResult;
  readonly configured: boolean;
}

export class EmptyGeoIp implements GeoIpProvider {
  readonly configured = false;
  lookup(): GeoIpResult {
    return { countryCode: null, continentCode: null, asn: null, asnOrg: null, configured: false };
  }
}

export class MapGeoIp implements GeoIpProvider {
  readonly configured = true;
  constructor(private readonly entries: Record<string, Partial<GeoIpResult>>) {}
  lookup(ip: string): GeoIpResult {
    const found = this.entries[ip] ?? {};
    const country = found.countryCode ? getCountry(found.countryCode) : undefined;
    return {
      countryCode: found.countryCode ?? null,
      continentCode: found.continentCode ?? country?.continent ?? null,
      asn: found.asn ?? null,
      asnOrg: found.asnOrg ?? null,
      configured: true,
    };
  }
}

interface MaxMindReader {
  get(ip: string): unknown;
}

export class MaxMindGeoIp implements GeoIpProvider {
  readonly configured = true;
  constructor(
    private readonly city: MaxMindReader | null,
    private readonly asn: MaxMindReader | null,
  ) {}

  lookup(ip: string): GeoIpResult {
    const city = this.city?.get(ip) as {
      country?: { iso_code?: string };
      continent?: { code?: string };
    } | null;
    const asn = this.asn?.get(ip) as {
      autonomous_system_number?: number;
      autonomous_system_organization?: string;
    } | null;
    const countryCode = city?.country?.iso_code ?? null;
    const country = countryCode ? getCountry(countryCode) : undefined;
    return {
      countryCode,
      continentCode: city?.continent?.code ?? country?.continent ?? null,
      asn: asn?.autonomous_system_number ?? null,
      asnOrg: asn?.autonomous_system_organization ?? null,
      configured: true,
    };
  }
}

export async function loadGeoIp(cityPath: string, asnPath: string): Promise<GeoIpProvider> {
  if (!cityPath && !asnPath) return new EmptyGeoIp();
  const { open } = await import("maxmind");
  const city = cityPath ? ((await open(cityPath)) as MaxMindReader) : null;
  const asn = asnPath ? ((await open(asnPath)) as MaxMindReader) : null;
  return new MaxMindGeoIp(city, asn);
}
