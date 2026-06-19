import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

type PropertySourceConfig = {
  adapter?: "arcgis" | "socrata" | "reference" | "licensed_provider";
  sourceId?: string;
  sourceName?: string;
  approved?: boolean;
  domain?: string;
  datasetId?: string;
  layerUrl?: string;
  url?: string;
  discoveryUrls?: string[];
  fields?: Record<string, string | undefined>;
};

type ValidationResult = {
  file: string;
  sourceId: string;
  ok: boolean;
  approved: boolean;
  messages: string[];
};

const args = parseArgs(process.argv.slice(2));
const configDir = args.dir || "configs/property-sources";

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const files = listJsonFiles(join(process.cwd(), configDir));
  if (files.length === 0) {
    throw new Error(`No property source configs found in ${configDir}`);
  }

  const results = [];
  for (const file of files) {
    results.push(await validateConfig(file));
  }

  for (const result of results) {
    const status = result.ok ? "ok" : "failed";
    const approval = result.approved ? "approved" : "candidate";
    console.log(`${status} ${approval} ${result.sourceId} (${result.file})`);
    for (const message of result.messages) {
      console.log(`  - ${message}`);
    }
  }

  const failures = results.filter((result) => !result.ok);
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

async function validateConfig(file: string): Promise<ValidationResult> {
  const config = JSON.parse(readFileSync(file, "utf8")) as PropertySourceConfig;
  const messages: string[] = [];
  const sourceId = config.sourceId ?? file;
  const adapter = config.adapter ?? inferAdapter(config);

  const localMissing = validateLocalShape(config, adapter);
  if (localMissing.length > 0) {
    return {
      file,
      sourceId,
      ok: false,
      approved: Boolean(config.approved),
      messages: localMissing,
    };
  }

  if (adapter === "reference" || adapter === "licensed_provider") {
    const reachable = await validateReferenceUrls(config);
    messages.push(...reachable);
    messages.push(
      adapter === "licensed_provider"
        ? "Licensed provider candidate only; ingest requires a contract that allows this product's display, caching, opt-out handling, and republication model."
        : "Reference source only; not importable by current people-search ingesters.",
    );

    return {
      file,
      sourceId,
      ok: true,
      approved: Boolean(config.approved),
      messages,
    };
  }

  const remoteFields =
    adapter === "arcgis"
      ? await loadArcGisFields(config.layerUrl ?? "")
      : await loadSocrataFields(config.domain ?? "", config.datasetId ?? "");

  const remoteFieldNames = new Set(remoteFields.map((field) => field.toLowerCase()));
  const mappedFields = unique(
    Object.values(config.fields ?? {}).filter(isNonEmptyString),
  );
  const missingRemoteFields = mappedFields.filter(
    (field) => !remoteFieldNames.has(field.toLowerCase()),
  );

  if (missingRemoteFields.length > 0) {
    messages.push(`Missing remote fields: ${missingRemoteFields.join(", ")}`);
  } else {
    messages.push(`Verified ${mappedFields.length} mapped field(s).`);
  }

  if (!config.approved) {
    messages.push(
      "Config is intentionally candidate-only; set approved=true only after terms, republication, and protected-address review.",
    );
  }

  return {
    file,
    sourceId,
    ok: missingRemoteFields.length === 0,
    approved: Boolean(config.approved),
    messages,
  };
}

function validateLocalShape(
  config: PropertySourceConfig,
  adapter: PropertySourceConfig["adapter"],
) {
  const missing: string[] = [];
  if (!adapter) {
    missing.push("Missing adapter.");
  }
  if (!config.sourceId) {
    missing.push("Missing sourceId.");
  }
  if (!config.sourceName) {
    missing.push("Missing sourceName.");
  }

  if (adapter === "reference" || adapter === "licensed_provider") {
    if (!config.url) {
      missing.push(`${adapter} configs require url.`);
    }
    return missing;
  }

  if (adapter === "arcgis" || adapter === "socrata") {
    for (const field of ["recordId", "name", "city", "state"] as const) {
      if (!config.fields?.[field]) {
        missing.push(`Missing required fields.${field}.`);
      }
    }
  }

  if (adapter === "arcgis" && !config.layerUrl) {
    missing.push("ArcGIS configs require layerUrl.");
  }
  if (adapter === "socrata" && (!config.domain || !config.datasetId)) {
    missing.push("Socrata configs require domain and datasetId.");
  }

  return missing;
}

async function validateReferenceUrls(config: PropertySourceConfig) {
  const urls = unique([config.url, ...(config.discoveryUrls ?? [])].filter(isNonEmptyString));
  const messages: string[] = [];

  for (const url of urls) {
    new URL(url);
    const response = await fetch(url, {
      headers: {
        "user-agent": "PeopleSearchPropertySourceValidator/0.1 local-development",
      },
      redirect: "follow",
    });
    if (response.ok) {
      continue;
    }

    if ([401, 403, 405].includes(response.status)) {
      messages.push(
        `Reference URL requires manual/browser review: ${response.status} ${url}`,
      );
      continue;
    }

    throw new Error(`Reference URL failed: ${response.status} ${url}`);
  }

  messages.push(`Verified ${urls.length} reference URL(s).`);
  return messages;
}

async function loadArcGisFields(layerUrl: string) {
  const url = new URL(layerUrl);
  url.searchParams.set("f", "json");
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ArcGIS metadata request failed for ${layerUrl}`);
  }

  const payload = (await response.json()) as {
    fields?: Array<{ name: string }>;
    error?: { message?: string };
  };
  if (payload.error) {
    throw new Error(
      `ArcGIS metadata request failed for ${layerUrl}: ${payload.error.message}`,
    );
  }

  return (payload.fields ?? []).map((field) => field.name);
}

async function loadSocrataFields(domain: string, datasetId: string) {
  const host = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const response = await fetch(`https://${host}/api/views/${datasetId}.json`);
  if (!response.ok) {
    throw new Error(`Socrata metadata request failed for ${host}/${datasetId}`);
  }

  const payload = (await response.json()) as {
    columns?: Array<{ fieldName?: string }>;
  };

  return (payload.columns ?? [])
    .map((field) => field.fieldName)
    .filter(Boolean) as string[];
}

function inferAdapter(config: PropertySourceConfig) {
  if (config.layerUrl) {
    return "arcgis";
  }
  if (config.domain && config.datasetId) {
    return "socrata";
  }
  return undefined;
}

function listJsonFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return listJsonFiles(path);
    }
    return entry.endsWith(".json") ? [path] : [];
  });
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function parseArgs(values: string[]) {
  const parsed: Record<string, string> = {};
  for (const value of values) {
    const match = value.match(/^--([^=]+)=(.*)$/);
    if (match) {
      parsed[match[1]] = match[2];
    }
  }
  return parsed;
}
