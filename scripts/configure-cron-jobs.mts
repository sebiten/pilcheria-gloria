import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const API_URL = "https://api.cron-job.org";
const ENV_FILE = resolve(process.cwd(), ".env.local");
const TIMEZONE = "America/Argentina/Buenos_Aires";

type CronJobSummary = {
  jobId: number;
  enabled: boolean;
  title: string;
  url: string;
};

type CronJobDefinition = {
  title: string;
  target: "app" | "supabase";
  path?: string;
  schedule: {
    timezone: string;
    expiresAt: number;
    hours: number[];
    mdays: number[];
    minutes: number[];
    months: number[];
    wdays: number[];
  };
};

const DEFINITIONS: CronJobDefinition[] = [
  {
    title: "Pilchería Gloria - Liberar reservas vencidas",
    target: "app",
    path: "/api/cron/expire-orders",
    schedule: {
      timezone: TIMEZONE,
      expiresAt: 0,
      hours: [-1],
      mdays: [-1],
      minutes: [0, 10, 20, 30, 40, 50],
      months: [-1],
      wdays: [-1],
    },
  },
  {
    title: "Pilchería Gloria - Mantener Supabase activo",
    target: "supabase",
    schedule: {
      timezone: TIMEZONE,
      expiresAt: 0,
      hours: [2, 8, 14, 20],
      mdays: [-1],
      minutes: [5],
      months: [-1],
      wdays: [-1],
    },
  },
];

function parseEnv(contents: string) {
  const values = new Map<string, string>();

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator < 1) continue;

    const key = line.slice(0, separator).trim();
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, "$2");
    values.set(key, value);
  }

  return values;
}

function upsertEnvValue(contents: string, key: string, value: string) {
  const lines = contents.split(/\r?\n/);
  const index = lines.findIndex((line) => line.startsWith(`${key}=`));

  if (index >= 0) {
    lines[index] = `${key}=${value}`;
  } else {
    if (lines.at(-1) !== "") lines.push("");
    lines.push(`${key}=${value}`);
  }

  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

async function cronJobRequest<T>(
  apiKey: string,
  path: string,
  init?: RequestInit
) {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `cron-job.org respondió ${response.status}: ${details.slice(0, 300)}`
    );
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : {}) as T;
}

async function endpointIsReady(baseUrl: string, cronSecret: string) {
  try {
    const response = await fetch(`${baseUrl}/api/cron/keepalive`, {
      headers: {
        Authorization: `Bearer ${cronSecret}`,
      },
      signal: AbortSignal.timeout(20_000),
    });

    return response.ok;
  } catch {
    return false;
  }
}

async function upsertJob(
  apiKey: string,
  existingJobs: CronJobSummary[],
  definition: CronJobDefinition,
  url: string,
  requestMethod: 0 | 1,
  requestHeaders: Record<string, string>,
  enabled: boolean
) {
  const matchingJobs = existingJobs.filter(
    (job) => job.title === definition.title || job.url === url
  );
  const existing = matchingJobs[0];
  const job = {
    title: definition.title,
    url,
    enabled,
    saveResponses: definition.target === "app",
    requestMethod,
    requestTimeout: 60,
    redirectSuccess: false,
    schedule: definition.schedule,
    notification: {
      onFailure: true,
      onFailureCount: 2,
      onSuccess: true,
      onDisable: true,
      onSslCertExpiry: true,
      onSslCertExpirySeconds: 604800,
    },
    extendedData: {
      headers: requestHeaders,
      body:
        requestMethod === 1
          ? JSON.stringify({ source: "cron-job.org" })
          : "",
    },
  };

  if (existing) {
    await cronJobRequest(apiKey, `/jobs/${existing.jobId}`, {
      method: "PATCH",
      body: JSON.stringify({ job }),
    });

    return { action: "updated", jobId: existing.jobId };
  }

  const result = await cronJobRequest<{ jobId: number }>(apiKey, "/jobs", {
    method: "PUT",
    body: JSON.stringify({ job }),
  });

  await new Promise((resolvePromise) => setTimeout(resolvePromise, 1100));
  return { action: "created", jobId: result.jobId };
}

async function main() {
  if (!existsSync(ENV_FILE)) {
    throw new Error("No existe .env.local");
  }

  let envContents = readFileSync(ENV_FILE, "utf8");
  const env = parseEnv(envContents);
  const apiKey = env.get("CRON_JOB_API_KEY");
  const appUrl = env.get("NEXT_PUBLIC_APP_URL");
  const supabaseUrl = env.get("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseAnonKey = env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (!apiKey) {
    throw new Error("Falta CRON_JOB_API_KEY en .env.local");
  }

  if (!appUrl) {
    throw new Error("Falta NEXT_PUBLIC_APP_URL en .env.local");
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local"
    );
  }

  let cronSecret = env.get("CRON_SECRET");
  if (!cronSecret) {
    cronSecret = randomBytes(32).toString("base64url");
    envContents = upsertEnvValue(envContents, "CRON_SECRET", cronSecret);
    writeFileSync(ENV_FILE, envContents, "utf8");
    console.log("CRON_SECRET generado en .env.local.");
  }

  const baseUrl = appUrl.replace(/\/+$/, "");
  const ready = await endpointIsReady(baseUrl, cronSecret);
  const forceDisabled = process.argv.includes("--disable");

  const list = await cronJobRequest<{
    jobs: CronJobSummary[];
    someFailed: boolean;
  }>(apiKey, "/jobs");

  for (const definition of DEFINITIONS) {
    const isSupabaseKeepalive = definition.target === "supabase";
    const url = isSupabaseKeepalive
      ? `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/store_settings?select=id&limit=1`
      : `${baseUrl}${definition.path}`;
    const requestMethod = isSupabaseKeepalive ? 0 : 1;
    const requestHeaders: Record<string, string> = isSupabaseKeepalive
      ? {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
          Accept: "application/json",
        }
      : {
          Authorization: `Bearer ${cronSecret}`,
          "Content-Type": "application/json",
          "X-Cron-Source": "cron-job.org",
        };
    const enabled = !forceDisabled && (isSupabaseKeepalive || ready);
    const result = await upsertJob(
      apiKey,
      list.jobs,
      definition,
      url,
      requestMethod,
      requestHeaders,
      enabled
    );
    console.log(
      `${definition.title}: ${result.action} (${result.jobId}), ${
        enabled ? "activo" : "pausado"
      }.`
    );
  }

  if (!ready && !forceDisabled) {
    console.log(
      "El job de reservas quedó pausado porque /api/cron/keepalive aún no responde con este CRON_SECRET."
    );
    console.log(
      "Configurá el mismo CRON_SECRET en producción, desplegá y ejecutá pnpm cron:configure otra vez."
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
