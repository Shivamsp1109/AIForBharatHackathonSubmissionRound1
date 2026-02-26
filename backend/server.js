const path = require("path");
const fs = require("fs");
const express = require("express");
const multer = require("multer");
const { computeRiskForProduct } = require("./riskEngine");

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, "..", "data", "processed");
const FRONTEND_DIR = path.join(__dirname, "..", "frontend");

app.use(express.json());
app.use(express.static(FRONTEND_DIR));

const upload = multer({ storage: multer.memoryStorage() });

function readCsv(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) return [];
  const lines = raw.split(/\r?\n/);
  const headers = lines[0].split(",");
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(",");
    const row = {};
    for (let j = 0; j < headers.length; j += 1) {
      row[headers[j]] = cols[j] !== undefined ? cols[j] : "";
    }
    rows.push(row);
  }
  return rows;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function loadData() {
  const salesPath = path.join(DATA_DIR, "sales_daily.csv");
  const inventoryPath = path.join(DATA_DIR, "inventory_snapshot.csv");
  const forecastPath = path.join(DATA_DIR, "forecast.csv");
  const catalogPath = path.join(DATA_DIR, "product_catalog.csv");

  const salesRows = readCsv(salesPath).map((r) => ({
    date: r.date,
    product_id: r.product_id,
    sales: toNumber(r.sales),
  }));

  const inventoryRows = readCsv(inventoryPath);
  const forecastRows = readCsv(forecastPath);
  const catalogRows = readCsv(catalogPath);

  const inventoryMap = new Map();
  for (const row of inventoryRows) {
    inventoryMap.set(row.product_id, toNumber(row.inventory));
  }

  const forecastMap = new Map();
  for (const row of forecastRows) {
    forecastMap.set(row.product_id, toNumber(row.forecast_next_7));
  }

  const catalogMap = new Map();
  for (const row of catalogRows) {
    catalogMap.set(row.product_id, row.product_name || row.product_id);
  }

  const byId = new Map();
  for (const row of salesRows) {
    if (!byId.has(row.product_id)) byId.set(row.product_id, []);
    byId.get(row.product_id).push(row);
  }

  for (const [pid, rows] of byId.entries()) {
    byId.set(
      pid,
      rows.sort((a, b) => (a.date < b.date ? -1 : 1))
    );
  }

  return { salesRows, inventoryMap, forecastMap, catalogMap, byId };
}

let cache = loadData();

function buildProducts(productIds, demoMode) {
  return productIds
    .filter((pid) => cache.byId.has(pid))
    .map((pid) => {
      const rows = cache.byId.get(pid) || [];
      const inventory = cache.inventoryMap.get(pid) || 0;
      const forecastNext7 = cache.forecastMap.get(pid) || 0;
      const metrics = computeRiskForProduct(pid, rows, inventory, forecastNext7, demoMode);
      metrics.product_name = cache.catalogMap.get(pid) || pid;
      metrics.trend = rows.slice(-30).map((r) => ({ date: r.date, sales: r.sales }));
      return metrics;
    });
}

function parseCsv(buffer) {
  const raw = buffer.toString("utf8").trim();
  if (!raw) return [];
  const lines = raw.split(/\r?\n/);
  const headers = lines[0].split(",");
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(",");
    const row = {};
    for (let j = 0; j < headers.length; j += 1) {
      row[headers[j]] = cols[j] !== undefined ? cols[j] : "";
    }
    rows.push(row);
  }
  return rows;
}

function productIdsFromTest(rows) {
  if (!rows.length) return [];
  const lowerHeaders = Object.keys(rows[0]).map((h) => h.toLowerCase());
  const hasStore = lowerHeaders.includes("store");
  const hasItem = lowerHeaders.includes("item");
  if (!hasStore || !hasItem) return [];
  const ids = new Set();
  for (const row of rows) {
    const store = row.store ?? row.Store ?? row.STORE;
    const item = row.item ?? row.Item ?? row.ITEM;
    if (store === undefined || item === undefined) continue;
    ids.add(`${store}_${item}`);
  }
  return Array.from(ids);
}

function handleUpload(req, res) {
  const mode = (req.body && req.body.mode) || "normal";
  const demoMode = mode === "demo";

  if (!req.file) {
    res.status(400).json({ error: "Missing file" });
    return;
  }

  const testRows = parseCsv(req.file.buffer);
  const productIds = productIdsFromTest(testRows);
  if (!productIds.length) {
    res.status(400).json({ error: "test.csv must include store and item columns" });
    return;
  }

  const result = buildProducts(productIds, demoMode);
  res.json({
    filename: demoMode ? "result-demo.json" : "result-normal.json",
    products: result,
  });
}

app.get("/api/v1/products", (req, res) => {
  const productIds = Array.from(cache.byId.keys());
  res.json({ products: buildProducts(productIds, false) });
});

app.get("/api/products", (req, res) => {
  const productIds = Array.from(cache.byId.keys());
  res.json({ products: buildProducts(productIds, false) });
});

app.post("/api/v1/upload", upload.single("file"), handleUpload);
app.post("/api/upload", upload.single("file"), handleUpload);

app.get("/api/v1/product/:id", (req, res) => {
  const id = req.params.id;
  const products = buildProducts([id], false);
  const product = products.length ? products[0] : null;
  const series = product ? product.trend : [];
  res.json({ product, series });
});

app.get("/api/product/:id", (req, res) => {
  const id = req.params.id;
  const products = buildProducts([id], false);
  const product = products.length ? products[0] : null;
  const series = product ? product.trend : [];
  res.json({ product, series });
});

app.post("/api/v1/reload", (req, res) => {
  cache = loadData();
  res.json({ status: "reloaded" });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
