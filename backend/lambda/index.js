const path = require("path");
const { buildCache, buildProducts, buildPortfolioResponse, parseCsvBuffer, productIdsFromTestRows } = require("../services/riskPipeline");
const { storeUploadAndResult, enabled: s3Enabled } = require("../services/s3Artifacts");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data", "processed");
const USE_BEDROCK = (process.env.ENABLE_BEDROCK || "false").toLowerCase() === "true";
const MAX_BEDROCK_ITEMS = Number(process.env.MAX_BEDROCK_ITEMS || 25);

let cache = buildCache(DATA_DIR);

function response(statusCode, payload) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
}

function parseBody(event) {
  if (!event.body) return {};
  if (event.isBase64Encoded) {
    const raw = Buffer.from(event.body, "base64").toString("utf8");
    return JSON.parse(raw);
  }
  return typeof event.body === "string" ? JSON.parse(event.body) : event.body;
}

exports.handler = async (event) => {
  const route = event.routeKey || `${event.httpMethod} ${event.path}`;

  if (route.includes("GET /api/v1/products")) {
    const portfolio = await buildPortfolioResponse(cache, Array.from(cache.byId.keys()), {
      demoMode: false,
      useBedrock: USE_BEDROCK,
      maxBedrockItems: MAX_BEDROCK_ITEMS,
    });
    return response(200, portfolio);
  }

  if (route.includes("POST /api/v1/reload")) {
    cache = buildCache(DATA_DIR);
    return response(200, { status: "reloaded" });
  }

  if (route.includes("POST /api/v1/upload")) {
    const body = parseBody(event);
    if (!body.csvBase64) return response(400, { error: "csvBase64 is required" });

    const mode = body.mode || "normal";
    const demoMode = mode === "demo";
    const csvBuffer = Buffer.from(body.csvBase64, "base64");
    const rows = parseCsvBuffer(csvBuffer);
    const productIds = productIdsFromTestRows(rows);
    if (!productIds.length) return response(400, { error: "CSV must include store and item columns" });

    const portfolio = await buildPortfolioResponse(cache, productIds, {
      demoMode,
      useBedrock: USE_BEDROCK,
      maxBedrockItems: MAX_BEDROCK_ITEMS,
    });
    const products = portfolio.products;

    let artifacts = null;
    if (s3Enabled()) {
      artifacts = await storeUploadAndResult({ mode, uploadBuffer: csvBuffer, products });
    }

    return response(200, {
      filename: demoMode ? "result-demo.json" : "result-normal.json",
      products,
      summary: portfolio.summary,
      executiveSummary: portfolio.executiveSummary,
      artifacts,
    });
  }

  return response(404, { error: "Route not found" });
};
