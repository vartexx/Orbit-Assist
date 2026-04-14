import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { GoogleAuth } from "google-auth-library";

const root = process.cwd();
const port = Number(process.env.PORT || 4173);
const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"]
});

const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8"
};

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
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
      model: process.env.VERTEX_MODEL || "gemini-2.5-flash"
    });
    return true;
  }

  if (request.method === "POST" && (pathname === "/api/plan" || pathname === "/api/follow-up")) {
    try {
      const body = await parseBody(request);
      const text = await callVertex(body.prompt);
      sendJson(response, 200, { text });
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : "Server request failed."
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
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": types[extname(filePath)] || "application/octet-stream",
    "Cache-Control": "no-store"
  });
  createReadStream(filePath).pipe(response);
}).listen(port, () => {
  console.log(`Orbit Assist running at http://localhost:${port}`);
});
