const path = require("path");
const express = require("express");
const multer = require("multer");
const { buildCache, buildProducts, buildPortfolioResponse, parseCsvBuffer, productIdsFromTestRows } = require("./services/riskPipeline");
const { storeUploadAndResult, enabled: s3Enabled } = require("./services/s3Artifacts");

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, "..", "data", "processed");
const FRONTEND_DIR = path.join(__dirname, "..", "frontend");
const upload = multer({ storage: multer.memoryStorage() });

const USE_BEDROCK = (process.env.ENABLE_BEDROCK || "false").toLowerCase() === "true";
const MAX_BEDROCK_ITEMS = Number(process.env.MAX_BEDROCK_ITEMS || 25);

app.use(express.json({ limit: "5mb" }));
app.use(express.static(FRONTEND_DIR));

let cache = buildCache(DATA_DIR);

function sendError(res, status, msg) {
  res.status(status).json({ error: msg });
}

async function handleProductsRequest(res, productIds, demoMode) {
  const portfolio = await buildPortfolioResponse(cache, productIds, {
    demoMode,
    useBedrock: USE_BEDROCK,
    maxBedrockItems: MAX_BEDROCK_ITEMS,
  });
  res.json(portfolio);
}

app.get("/api/v1/products", async (req, res) => {
  await handleProductsRequest(res, Array.from(cache.byId.keys()), false);
});

app.get("/api/products", async (req, res) => {
  await handleProductsRequest(res, Array.from(cache.byId.keys()), false);
});

app.get("/api/v1/product/:id", async (req, res) => {
  const products = await buildProducts(cache, [req.params.id], {
    demoMode: false,
    useBedrock: USE_BEDROCK,
    maxBedrockItems: 1,
  });
  const product = products.length ? products[0] : null;
  res.json({ product, series: product ? product.trend : [] });
});

app.get("/api/product/:id", async (req, res) => {
  const products = await buildProducts(cache, [req.params.id], {
    demoMode: false,
    useBedrock: USE_BEDROCK,
    maxBedrockItems: 1,
  });
  const product = products.length ? products[0] : null;
  res.json({ product, series: product ? product.trend : [] });
});

async function handleUpload(req, res) {
  const mode = (req.body && req.body.mode) || "normal";
  const demoMode = mode === "demo";

  let uploadBuffer = null;
  if (req.file && req.file.buffer) {
    uploadBuffer = req.file.buffer;
  } else if (req.body && req.body.csvBase64) {
    try {
      uploadBuffer = Buffer.from(req.body.csvBase64, "base64");
    } catch (err) {
      return sendError(res, 400, "Invalid csvBase64 payload");
    }
  }
  if (!uploadBuffer) return sendError(res, 400, "Missing file or csvBase64");

  const testRows = parseCsvBuffer(uploadBuffer);
  const productIds = productIdsFromTestRows(testRows);
  if (!productIds.length) return sendError(res, 400, "test.csv must include store and item columns");

  const portfolio = await buildPortfolioResponse(cache, productIds, {
    demoMode,
    useBedrock: USE_BEDROCK,
    maxBedrockItems: MAX_BEDROCK_ITEMS,
  });
  const products = portfolio.products;

  let artifacts = null;
  if (s3Enabled()) {
    try {
        artifacts = await storeUploadAndResult({
          mode,
          uploadBuffer,
          products,
        });
    } catch (err) {
      artifacts = { error: "S3 storage failed" };
    }
  }

  res.json({
    filename: demoMode ? "result-demo.json" : "result-normal.json",
    products,
    summary: portfolio.summary,
    executiveSummary: portfolio.executiveSummary,
    artifacts,
  });
}

app.post("/api/v1/upload", upload.single("file"), async (req, res) => {
  await handleUpload(req, res);
});

app.post("/api/upload", upload.single("file"), async (req, res) => {
  await handleUpload(req, res);
});

app.post("/api/v1/reload", (req, res) => {
  cache = buildCache(DATA_DIR);
  res.json({ status: "reloaded" });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    bedrockEnabled: USE_BEDROCK,
    s3Enabled: s3Enabled(),
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
