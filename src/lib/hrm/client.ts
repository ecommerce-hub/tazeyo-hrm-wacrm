// Server-only client for the Tazeyo HRM integration
// (/api/public/integrations/wacrm/* on the HRM deployment, a separate
// Cloudflare Pages app with its own Postgres). The shared key
// authenticates this whole deployment, so it must never reach the
// browser — the UI talks to /api/hrm/* routes, which call this.

export interface HrmStore {
  id: number;
  name: string;
}

export interface HrmStaffRequest {
  id: number;
  store_id: number;
  store_name: string;
  position_title: string;
  headcount: number;
}

export interface HrmOptions {
  stores: HrmStore[];
  staff_requests: HrmStaffRequest[];
}

export interface HrmCandidateInput {
  first_name: string;
  last_name: string;
  phone: string;
  store_id?: number;
  staff_request_id?: number;
  hr_notes?: string;
}

/** The HRM candidates row, as returned by its create endpoint. */
export interface HrmCandidate {
  id: number;
  first_name: string;
  last_name: string;
  phone: string;
  status: string;
}

export class HrmError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** On a 409, the id of the already-registered candidate. */
    readonly candidateId?: number,
  ) {
    super(message);
    this.name = "HrmError";
  }

  get isDuplicate(): boolean {
    return this.status === 409;
  }
}

function config(): { url: string; key: string } | null {
  const url = process.env.HRM_API_URL?.replace(/\/+$/, "");
  const key = process.env.HRM_API_KEY;
  return url && key ? { url, key } : null;
}

export function isHrmConfigured(): boolean {
  return config() !== null;
}

/** Deep link into the HRM UI for a candidate, for toasts/tooltips. */
export function hrmCandidateUrl(candidateId: number): string | null {
  const cfg = config();
  return cfg ? `${cfg.url}/candidates/${candidateId}` : null;
}

async function hrmFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const cfg = config();
  if (!cfg) throw new HrmError("HRM integration is not configured", 503);

  // Only JSON bodies get an explicit Content-Type — a FormData body must
  // let fetch set the multipart boundary itself. The User-Agent matters:
  // Node's fetch sends none by default, and Cloudflare's bot heuristics
  // treat a UA-less request from a datacenter IP (our ECS egress) as
  // hostile — identify ourselves instead.
  const headers: Record<string, string> = {
    "X-Api-Key": cfg.key,
    "User-Agent": "tazeyo-wacrm/1.0 (+hrm-integration)",
  };
  if (typeof init?.body === "string") headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`${cfg.url}${path}`, {
      ...init,
      headers: { ...headers, ...init?.headers },
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new HrmError("HRM request failed or timed out", 502);
  }

  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    let body: { error?: string; candidate_id?: number } | null = null;
    try {
      body = JSON.parse(raw);
    } catch {
      // Not our endpoint's JSON — an edge layer (Cloudflare WAF/Access/
      // bot protection) answered instead of the HRM app. Surface what it
      // said so the operator can tell WHICH layer blocked the request:
      // `cf-mitigated` names the Cloudflare security product when one did.
      const mitigated = res.headers.get("cf-mitigated");
      const snippet = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
      throw new HrmError(
        `HRM responded with ${res.status}` +
          (mitigated ? ` (cf-mitigated: ${mitigated})` : "") +
          (snippet ? ` — ${snippet}` : ""),
        res.status,
      );
    }
    throw new HrmError(
      body?.error || `HRM responded with ${res.status}`,
      res.status,
      body?.candidate_id,
    );
  }
  return res.json() as Promise<T>;
}

export function hrmGetOptions(): Promise<HrmOptions> {
  return hrmFetch<HrmOptions>("/api/public/integrations/wacrm/options");
}

export function hrmCreateCandidate(
  input: HrmCandidateInput,
): Promise<HrmCandidate> {
  return hrmFetch<HrmCandidate>("/api/public/integrations/wacrm/candidates", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** CV to forward to the HRM, wherever the bytes came from (an agent
 *  upload or a document fetched off the conversation). */
export interface HrmCvFile {
  bytes: ArrayBuffer | Uint8Array;
  name: string;
  type: string;
}

/** Attaches a CV to a just-created candidate. The HRM uploads it to
 *  Google Drive and sets `cv_url`; it only accepts this for candidates
 *  the wacrm service user created that have no CV yet. */
export function hrmUploadCandidateCv(
  candidateId: number,
  file: HrmCvFile,
): Promise<{ url: string }> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([file.bytes as BlobPart], { type: file.type }),
    file.name,
  );
  return hrmFetch<{ url: string }>(
    `/api/public/integrations/wacrm/candidates/${candidateId}/cv`,
    { method: "POST", body: form },
  );
}
