import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { GoogleAuth } from "google-auth-library";
import { BigQuery } from "@google-cloud/bigquery";

const root = process.cwd();
const port = Number(process.env.PORT || 4173);
const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"]
});
const bigquery = new BigQuery();
const analyticsDatasetId = process.env.BIGQUERY_DATASET || "orbit_assist";
const analyticsTableId = process.env.BIGQUERY_TABLE || "workflow_events";
let analyticsReadyPromise = null;

const types = {
  ".css": "text/css; charset=utf-8",
  ".ico": "image/x-icon",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".mjs": "application/javascript; charset=utf-8"
};

const defaultHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' https://accounts.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self' https://www.googleapis.com https://gmail.googleapis.com https://accounts.google.com https://asia-south1-aiplatform.googleapis.com; img-src 'self' data:; frame-src https://accounts.google.com; object-src 'none'; base-uri 'self'; form-action 'self'"
};

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    ...defaultHeaders,
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(body));
}

function parseBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Request body too large."));
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    request.on("error", reject);
  });
}

async function ensureAnalyticsTable() {
  if (!analyticsReadyPromise) {
    analyticsReadyPromise = (async () => {
      const dataset = bigquery.dataset(analyticsDatasetId);
      const [datasetExists] = await dataset.exists();
      if (!datasetExists) {
        await dataset.create({ location: "asia-south1" });
      }

      const table = dataset.table(analyticsTableId);
      const [tableExists] = await table.exists();
      if (!tableExists) {
        await table.create({
          schema: [
            { name: "timestamp", type: "TIMESTAMP" },
            { name: "event_type", type: "STRING" },
            { name: "source", type: "STRING" },
            { name: "details_json", type: "STRING" }
          ]
        });
      }
    })().catch((error) => {
      analyticsReadyPromise = null;
      throw error;
    });
  }

  return analyticsReadyPromise;
}

async function logWorkflowEvent(eventType, details = {}, source = "backend") {
  try {
    await ensureAnalyticsTable();
    await bigquery
      .dataset(analyticsDatasetId)
      .table(analyticsTableId)
      .insert([
        {
          timestamp: new Date().toISOString(),
          event_type: eventType,
          source,
          details_json: JSON.stringify(details)
        }
      ]);
  } catch (error) {
    console.error("BigQuery logging failed:", error instanceof Error ? error.message : error);
  }
}

async function callVertex(prompt) {
  if (!prompt || typeof prompt !== "string") {
    throw new Error("Prompt is required.");
  }

  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const accessToken = typeof tokenResponse === "string" ? tokenResponse : tokenResponse?.token;
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || (await auth.getProjectId());
  const region = process.env.VERTEX_REGION || "asia-south1";
  const model = process.env.VERTEX_MODEL || "gemini-2.5-flash";
  const endpoint =
    `https://${region}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}` +
    `/publishers/google/models/${model}:generateContent`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ]
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || "Vertex AI request failed.");
  }

  return (
    payload?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("\n")
      .trim() || ""
  );
}

async function handleApi(request, response, pathname) {
  if (request.method === "GET" && pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      provider: "vertex-ai",
      region: process.env.VERTEX_REGION || "asia-south1",
      model: process.env.VERTEX_MODEL || "gemini-2.5-flash",
      analytics: `${analyticsDatasetId}.${analyticsTableId}`
    });
    return true;
  }

  if (request.method === "POST" && (pathname === "/api/plan" || pathname === "/api/follow-up")) {
    try {
      const body = await parseBody(request);
      const text = await callVertex(body.prompt);
      await logWorkflowEvent(pathname === "/api/plan" ? "vertex_plan_request" : "vertex_followup_request", {
        promptLength: body.prompt?.length || 0
      });
      sendJson(response, 200, { text });
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : "Server request failed."
      });
    }
    return true;
  }

  if (request.method === "POST" && pathname === "/api/log-event") {
    try {
      const body = await parseBody(request);
      if (!body?.type || typeof body.type !== "string") {
        throw new Error("Event type is required.");
      }

      await logWorkflowEvent(body.type, body.details || {}, "frontend");
      sendJson(response, 200, { ok: true });
    } catch (error) {
      sendJson(response, 400, {
        error: error instanceof Error ? error.message : "Analytics event failed."
      });
    }
    return true;
  }

  return false;
}

createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const pathname = url.pathname;

  if (await handleApi(request, response, pathname)) {
    return;
  }

  const effectivePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(join(root, effectivePath));

  if (!filePath.startsWith(root) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    response.writeHead(404, { ...defaultHeaders, "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    ...defaultHeaders,
    "Content-Type": types[extname(filePath)] || "application/octet-stream",
    "Cache-Control": "no-store"
  });
  createReadStream(filePath).pipe(response);
}).listen(port, () => {
  console.log(`Orbit Assist running at http://localhost:${port}`);
});
