function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values) {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = mean(values.map((v) => (v - m) ** 2));
  return Math.sqrt(variance);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function applyDemoInventory(productId, inventory, demoMode) {
  if (!demoMode) return inventory;
  if (productId === "10_13" || productId === "10_15") return Math.floor(inventory * 0.3);
  if (productId === "10_25") return Math.floor(Math.max(inventory * 20, 100000));
  return inventory;
}

function computeRiskForProduct(productId, rows, inventory, forecastNext7, demoMode) {
  const recent = rows.slice(-28);
  const last7 = recent.slice(-7);
  const last14 = recent.slice(-14);
  const last30 = rows.slice(-30);

  const last7Sales = last7.map((r) => toNumber(r.sales));
  const last14Sales = last14.map((r) => toNumber(r.sales));
  const last30Sales = last30.map((r) => toNumber(r.sales));

  const avg7 = mean(last7Sales);
  const avg14 = mean(last14Sales);
  const lastDaySales = last7Sales.length ? last7Sales[last7Sales.length - 1] : 0;
  const z = stdDev(last14Sales) === 0 ? 0 : (lastDaySales - avg14) / stdDev(last14Sales);
  const demandSpike = z >= 2.0;

  const adjustedInventory = applyDemoInventory(productId, inventory, demoMode);
  const total30 = last30Sales.reduce((sum, x) => sum + x, 0);
  const sellThrough30d = total30 / Math.max(adjustedInventory, 1);

  const daysOfCoverRaw = avg7 === 0 ? Number.POSITIVE_INFINITY : adjustedInventory / avg7;
  const daysOfCover = Number.isFinite(daysOfCoverRaw) ? Number(daysOfCoverRaw.toFixed(2)) : null;
  const daysOfCoverLabel = Number.isFinite(daysOfCoverRaw) ? daysOfCover.toString() : "Infinity";

  let stockoutScore = 0;
  if (Number.isFinite(daysOfCoverRaw)) {
    stockoutScore = clamp(100 - daysOfCoverRaw * 15, 0, 100);
    if (demandSpike && daysOfCoverRaw < 7) {
      stockoutScore = clamp(stockoutScore + 10, 0, 100);
    }
  }

  let deadScore = 0;
  if (avg7 === 0) {
    deadScore = 95;
  } else if (sellThrough30d < 0.05) {
    deadScore = 75;
  } else if (sellThrough30d < 0.1) {
    deadScore = 50;
  }

  let riskType = "No Risk";
  let riskScore = 0;
  let riskReason = "Stable inventory coverage";
  let explanation = "No immediate risk detected based on recent sales and inventory.";

  if (stockoutScore > deadScore && stockoutScore >= 40) {
    riskScore = Math.round(stockoutScore);
    riskType = stockoutScore >= 75 ? "High Stockout Risk" : "Medium Stockout Risk";
    riskReason = demandSpike ? "Low inventory coverage with demand spike" : "Low inventory coverage";
    explanation = `Stockout risk: coverage is ${daysOfCoverLabel} days at avg ${avg7.toFixed(1)} units/day.`;
  } else if (deadScore >= 50) {
    riskScore = Math.round(deadScore);
    riskType = deadScore >= 75 ? "High Dead Inventory Risk" : "Medium Dead Inventory Risk";
    riskReason = avg7 === 0 ? "Zero demand" : "Low sell-through";
    explanation =
      avg7 === 0
        ? "Dead inventory risk: no recent sales observed."
        : `Dead inventory risk: 30-day sell-through is ${(sellThrough30d * 100).toFixed(1)}%.`;
  }

  let demandTrend = "Stable";
  if (avg14 > 0 && avg7 > avg14 * 1.1) demandTrend = "Rising";
  if (avg14 > 0 && avg7 < avg14 * 0.9) demandTrend = "Falling";
  if (avg14 === 0 && avg7 === 0) demandTrend = "Flat";

  return {
    product_id: productId,
    inventory: adjustedInventory,
    avg7: Number(avg7.toFixed(2)),
    avg14: Number(avg14.toFixed(2)),
    forecastNext7: Number(forecastNext7.toFixed(2)),
    daysOfCover,
    daysOfCoverLabel,
    sellThrough30d: Number(sellThrough30d.toFixed(4)),
    demandTrend,
    demandSpike,
    stockoutScore: Math.round(stockoutScore),
    deadInventoryScore: Math.round(deadScore),
    riskType,
    riskScore,
    riskReason,
    explanation,
  };
}

module.exports = {
  computeRiskForProduct,
};
