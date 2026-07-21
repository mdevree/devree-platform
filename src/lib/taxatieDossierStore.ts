import { TAXATIE_SUBFOLDERS, taxatieNextcloudBasePath, type TaxatieProjectForMatch } from "@/lib/taxatieMail";
import type { TaxatieDossier } from "@/lib/taxatieSourceConflicts";

export interface TaxatieDossierProject extends TaxatieProjectForMatch {
  createdAt?: Date | string | null;
}

export interface TaxatieDossierDocument {
  dossier: TaxatieDossier;
  path: string;
  etag: string | null;
  exists: boolean;
}

interface WebDavConfig {
  baseUrl: string;
  username: string;
  password: string;
  rootPath: string;
}

export class DossierWriteConflictError extends Error {
  constructor() {
    super("dossier.json is intussen gewijzigd; laad het dossier opnieuw en herhaal de handeling");
    this.name = "DossierWriteConflictError";
  }
}

function encodeWebDavPath(path: string) {
  return path
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function joinPath(...parts: Array<string | null | undefined>) {
  return parts
    .flatMap((part) => String(part || "").split("/"))
    .filter(Boolean)
    .join("/");
}

function loadConfig(): WebDavConfig {
  const nextcloudUrl = process.env.NEXTCLOUD_URL?.replace(/\/$/, "");
  const username = process.env.NEXTCLOUD_USER || "";
  const password = process.env.NEXTCLOUD_APP_PASSWORD || "";
  const directWebDavUrl = process.env.TAXATIE_NEXTCLOUD_WEBDAV_URL?.replace(/\/$/, "");
  if ((!nextcloudUrl && !directWebDavUrl) || !username || !password) {
    throw new Error("Nextcloud-configuratie voor taxatiedossiers ontbreekt");
  }
  return {
    baseUrl: directWebDavUrl || `${nextcloudUrl}/remote.php/dav/files/${encodeURIComponent(username)}`,
    username,
    password,
    rootPath: process.env.TAXATIE_NEXTCLOUD_ROOT || "",
  };
}

function archiveBasePath(path: string) {
  const normalized = path.replace(/^\/+/, "");
  for (const subfolder of Object.values(TAXATIE_SUBFOLDERS)) {
    const marker = `/${subfolder}/`;
    const markerIndex = normalized.indexOf(marker);
    if (markerIndex >= 0) return normalized.slice(0, markerIndex);
  }
  return null;
}

function createdAtIso(project: TaxatieDossierProject) {
  if (!project.createdAt) return null;
  const date = new Date(project.createdAt);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function resolveTaxatieDossierPath(project: TaxatieDossierProject, archivePaths: Array<string | null | undefined>) {
  const knownBase = archivePaths.map((path) => path ? archiveBasePath(path) : null).find(Boolean);
  const fallback = taxatieNextcloudBasePath(project, createdAtIso(project));
  const base = knownBase || joinPath(process.env.TAXATIE_NEXTCLOUD_ROOT || "", fallback);
  return joinPath(base, "dossier.json");
}

export function createInitialTaxatieDossier(project: TaxatieDossierProject, path: string, timestamp = new Date().toISOString()): TaxatieDossier {
  return {
    meta: {
      dossier_id: project.id,
      aangemaakt: timestamp,
      laatst_bijgewerkt: timestamp,
      versie: "1.1",
      nextcloud_pad: `/${path}`,
    },
    object: {
      adres: project.woningAdres || project.address || project.name,
      woonplaats: project.woningPlaats || null,
      postcode: project.woningPostcode || null,
      ai_mag_wijzigen: true,
    },
    audit_log: [],
  };
}

function authorization(config: WebDavConfig) {
  return `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`;
}

export async function readTaxatieDossier(
  project: TaxatieDossierProject,
  archivePaths: Array<string | null | undefined>
): Promise<TaxatieDossierDocument> {
  const config = loadConfig();
  const path = resolveTaxatieDossierPath(project, archivePaths);
  const response = await fetch(`${config.baseUrl}/${encodeWebDavPath(path)}`, {
    headers: { Authorization: authorization(config), Accept: "application/json" },
    cache: "no-store",
  });
  if (response.status === 404) {
    return { dossier: createInitialTaxatieDossier(project, path), path, etag: null, exists: false };
  }
  if (!response.ok) {
    throw new Error(`dossier.json ophalen uit Nextcloud mislukt (${response.status})`);
  }
  const raw = await response.text();
  let dossier: TaxatieDossier;
  try {
    dossier = JSON.parse(raw) as TaxatieDossier;
  } catch {
    throw new Error("dossier.json bevat geen geldige JSON");
  }
  return {
    dossier,
    path,
    etag: response.headers.get("etag"),
    exists: true,
  };
}

export async function writeTaxatieDossier(document: TaxatieDossierDocument): Promise<TaxatieDossierDocument> {
  const config = loadConfig();
  const timestamp = new Date().toISOString();
  const meta = document.dossier.meta && typeof document.dossier.meta === "object" && !Array.isArray(document.dossier.meta)
    ? document.dossier.meta as Record<string, unknown>
    : {};
  meta.laatst_bijgewerkt = timestamp;
  meta.nextcloud_pad = `/${document.path}`;
  document.dossier.meta = meta;

  const headers: Record<string, string> = {
    Authorization: authorization(config),
    "Content-Type": "application/json; charset=utf-8",
  };
  if (document.etag) headers["If-Match"] = document.etag;
  else headers["If-None-Match"] = "*";

  const response = await fetch(`${config.baseUrl}/${encodeWebDavPath(document.path)}`, {
    method: "PUT",
    headers,
    body: `${JSON.stringify(document.dossier, null, 2)}\n`,
  });
  if ([409, 412].includes(response.status)) throw new DossierWriteConflictError();
  if (!response.ok) {
    throw new Error(`dossier.json opslaan in Nextcloud mislukt (${response.status})`);
  }
  return {
    ...document,
    etag: response.headers.get("etag") || document.etag,
    exists: true,
  };
}
