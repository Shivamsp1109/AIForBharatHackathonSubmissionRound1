const fs = require("fs");
const path = require("path");
const { computeRiskForProduct } = require("../riskEngine");
const {
  generateExplanationWithBedrock,
  generateExecutiveSummaryWithBedrock,
  fallbackAction,
  fallbackExecutiveSummary,
  fallbackUrgency,
} = require("./aiExplanation");

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
    for (let j = 0; j < headers.length; j += 1) row[headers[j]] = cols[j] !== undefined ? cols[j] : "";
    rows.push(row);
  }
  return rows;
}

function parseCsvBuffer(buffer) {
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
    for (let j = 0; j < headers.length; j += 1) row[headers[j]] = cols[j] !== undefined ? cols[j] : "";
    rows.push(row);
  }
  return rows;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function productIdsFromTestRows(rows) {
  if (!rows.length) return [];
  const lowerHeaders = Object.keys(rows[0]).map((h) => h.toLowerCase());
  if (!lowerHeaders.includes("store") || !lowerHeaders.includes("item")) return [];
  const ids = new Set();
  for (const row of rows) {
    const store = row.store ?? row.Store ?? row.STORE;
    const item = row.item ?? row.Item ?? row.ITEM;
    if (store !== undefined && item !== undefined) ids.add(`${store}_${item}`);
  }
  return Array.from(ids);
}

function buildCache(dataDir) {
  const salesPath = path.join(dataDir, "sales_daily.csv");
  const inventoryPath = path.join(dataDir, "inventory_snapshot.csv");
  const forecastPath = path.join(dataDir, "forecast.csv");
  const catalogPath = path.join(dataDir, "product_catalog.csv");

  const salesRows = readCsv(salesPath).map((r) => ({
    date: r.date,
    product_id: r.product_id,
    sales: toNumber(r.sales),
  }));

  const inventoryMap = new Map(readCsv(inventoryPath).map((r) => [r.product_id, toNumber(r.inventory)]));
  const forecastMap = new Map(readCsv(forecastPath).map((r) => [r.product_id, toNumber(r.forecast_next_7)]));
  const catalogMap = new Map(readCsv(catalogPath).map((r) => [r.product_id, r.product_name || r.product_id]));

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

  return { byId, inventoryMap, forecastMap, catalogMap };
}

async function buildProducts(cache, productIds, options) {
  const demoMode = options && options.demoMode ? true : false;
  const useBedrock = options && options.useBedrock ? true : false;
  const maxBedrockItems = options && options.maxBedrockItems ? options.maxBedrockItems : 25;
  let bedrockCalls = 0;

  const products = [];
  for (const pid of productIds) {
    if (!cache.byId.has(pid)) continue;
    const rows = cache.byId.get(pid) || [];
    const inventory = cache.inventoryMap.get(pid) || 0;
    const forecast = cache.forecastMap.get(pid) || 0;
    const metrics = computeRiskForProduct(pid, rows, inventory, forecast, demoMode);
    metrics.product_name = cache.catalogMap.get(pid) || pid;
    metrics.trend = rows.slice(-30).map((r) => ({ date: r.date, sales: r.sales }));
    metrics.recommendedAction = fallbackAction(metrics);
    metrics.urgencyLevel = fallbackUrgency(metrics);

    if (useBedrock && metrics.riskType !== "No Risk" && bedrockCalls < maxBedrockItems) {
      try {
        const ai = await generateExplanationWithBedrock(metrics);
        metrics.explanation = ai.explanation;
        metrics.recommendedAction = ai.recommendedAction;
        metrics.urgencyLevel = ai.urgencyLevel || metrics.urgencyLevel;
        bedrockCalls += 1;
      } catch (err) {
        // Keep deterministic fallback explanation on model call failure.
      }
    }
    products.push(metrics);
  }
  return products;
}

function buildSummary(products) {
  const riskDistribution = {};
  let highRiskCount = 0;
  let totalRevenueAtRisk = 0;
  let totalCapitalBlocked = 0;

  for (const product of products) {
    const riskType = product.riskType || "No Risk";
    riskDistribution[riskType] = (riskDistribution[riskType] || 0) + 1;
    if (riskType.startsWith("High")) highRiskCount += 1;
    totalRevenueAtRisk += product.estimatedLostRevenue || 0;
    totalCapitalBlocked += product.workingCapitalBlocked || 0;
  }

  return {
    totalProducts: products.length,
    highRiskCount,
    totalRevenueAtRisk,
    totalCapitalBlocked,
    riskDistribution,
  };
}

async function buildPortfolioResponse(cache, productIds, options) {
  const useBedrock = options && options.useBedrock ? true : false;
  const products = await buildProducts(cache, productIds, options);
  products.sort((a, b) => {
    const aImpact = (a.estimatedLostRevenue || 0) + (a.workingCapitalBlocked || 0);
    const bImpact = (b.estimatedLostRevenue || 0) + (b.workingCapitalBlocked || 0);
    if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
    return bImpact - aImpact;
  });
  const summary = buildSummary(products);

  let executiveSummary = fallbackExecutiveSummary(summary);
  if (useBedrock) {
    try {
      executiveSummary = await generateExecutiveSummaryWithBedrock(summary);
    } catch (err) {
      executiveSummary = fallbackExecutiveSummary(summary);
    }
  }

  return { products, summary, executiveSummary };
}

module.exports = {
  buildCache,
  buildProducts,
  buildPortfolioResponse,
  parseCsvBuffer,
  productIdsFromTestRows,
};
