/**
 * set-cors.js — Diagnose + set CORS on Firebase Storage.
 * Run: node set-cors.js
 */

const https = require("https");
const fs    = require("fs");
const path  = require("path");
const os    = require("os");

const PROJECT_ID = "pajphive";

const CORS_CONFIG = [
  {
    origin: [
      "https://pajphive.web.app",
      "https://pajphive.firebaseapp.com",
      "http://localhost:5000",
    ],
    method: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    responseHeader: [
      "Content-Type",
      "Authorization",
      "Content-Length",
      "X-Requested-With",
    ],
    maxAgeSeconds: 3600,
  },
];

// ── Read stored Firebase CLI credentials ─────────────────────────────────────
function getStoredToken() {
  const candidates = [
    path.join(os.homedir(), "AppData", "Roaming", "configstore", "firebase-tools.json"),
    path.join(os.homedir(), ".config", "configstore", "firebase-tools.json"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const cfg = JSON.parse(fs.readFileSync(p, "utf8"));
      if (cfg.tokens) return cfg.tokens;
    }
  }
  throw new Error("Could not find Firebase credentials. Run `firebase login` first.");
}

// ── Refresh access token ──────────────────────────────────────────────────────
function refreshAccessToken(refreshToken) {
  const CLIENT_ID     = "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com";
  const CLIENT_SECRET = "j9iVZfS8kkCEFUPaAeJV0sAi";
  const body = new URLSearchParams({
    grant_type: "refresh_token", refresh_token: refreshToken,
    client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
  }).toString();

  return httpsPost("oauth2.googleapis.com", "/token",
    { "Content-Type": "application/x-www-form-urlencoded" }, body
  ).then((res) => {
    const json = JSON.parse(res);
    if (json.access_token) return json.access_token;
    throw new Error("Token refresh failed: " + res);
  });
}

// ── Generic HTTPS helpers ─────────────────────────────────────────────────────
function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname, path, method: "POST",
        headers: { ...headers, "Content-Length": Buffer.byteLength(body) } },
      (res) => { let d = ""; res.on("data", c => d += c); res.on("end", () => resolve(d)); }
    );
    req.on("error", reject); req.write(body); req.end();
  });
}

function httpsRequest(method, hostname, urlPath, headers, body) {
  return new Promise((resolve, reject) => {
    const opts = { hostname, path: urlPath, method,
      headers: body ? { ...headers, "Content-Length": Buffer.byteLength(body) } : headers };
    const req = https.request(opts, (res) => {
      let d = ""; res.on("data", c => d += c);
      res.on("end", () => resolve({ status: res.statusCode, body: d }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

// ── List all GCS buckets in project ──────────────────────────────────────────
async function listBuckets(token) {
  const r = await httpsRequest("GET", "storage.googleapis.com",
    `/storage/v1/b?project=${PROJECT_ID}`,
    { "Authorization": `Bearer ${token}` }
  );
  console.log(`\nBucket list API → HTTP ${r.status}`);
  const json = JSON.parse(r.body);
  if (json.error) {
    console.log("Error:", json.error.message);
    return [];
  }
  const items = json.items || [];
  console.log(`Found ${items.length} bucket(s):`);
  items.forEach(b => console.log("  •", b.id || b.name));
  return items;
}

// ── Patch CORS on a bucket ────────────────────────────────────────────────────
async function patchBucketCors(token, bucket) {
  const body = JSON.stringify({ cors: CORS_CONFIG });
  const r = await httpsRequest("PATCH", "storage.googleapis.com",
    `/storage/v1/b/${encodeURIComponent(bucket)}?fields=cors`,
    { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body
  );
  return r;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("Reading Firebase credentials...");
  const tokens = getStoredToken();

  console.log("Refreshing access token...");
  const token = await refreshAccessToken(tokens.refresh_token);
  console.log("Token OK.");

  // Step 1: list buckets so we can see what's actually there
  const buckets = await listBuckets(token);

  if (buckets.length === 0) {
    console.log("\nNo buckets visible to this account via GCS API.");
    console.log("This usually means the Firebase Storage bucket is in a");
    console.log("Google-managed project. Trying Firebase Storage API directly...\n");

    // Step 2: try Firebase Storage REST API (different endpoint)
    const candidates = [
      `${PROJECT_ID}.appspot.com`,
      `${PROJECT_ID}.firebasestorage.app`,
    ];
    for (const bucket of candidates) {
      process.stdout.write(`  PATCH gs://${bucket} ... `);
      const r = await patchBucketCors(token, bucket);
      console.log(`HTTP ${r.status}`);
      if (r.status === 200) {
        console.log(`\n✅  CORS set on gs://${bucket}`);
        return;
      }
      if (r.status !== 404) console.log("     Response:", r.body.slice(0, 200));
    }

    console.log("\n❌  Could not set CORS automatically.");
    console.log("\nMANUAL FIX — open this URL and check your bucket name:");
    console.log("  https://console.firebase.google.com/project/pajphive/storage");
    console.log("\nThen reply with the bucket name and we'll update the script.");
    return;
  }

  // Step 3: patch the first matching bucket
  for (const b of buckets) {
    const name = b.id || b.name;
    process.stdout.write(`\nPatching gs://${name} ... `);
    const r = await patchBucketCors(token, name);
    if (r.status === 200) {
      console.log("✅");
      console.log(`\nCORS applied to gs://${name}`);
      if (name !== "pajphive.firebasestorage.app") {
        console.log(`\n⚠️  Update firebase-config.js → storageBucket: "${name}"`);
      }
    } else {
      console.log(`HTTP ${r.status}`);
      console.log(r.body.slice(0, 300));
    }
  }
}

main().catch((err) => {
  console.error("\n❌  Error:", err.message);
  process.exit(1);
});
