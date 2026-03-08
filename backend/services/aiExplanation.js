const { BedrockRuntimeClient, ConverseCommand } = require("@aws-sdk/client-bedrock-runtime");

const DEFAULT_MODEL_ID = process.env.BEDROCK_MODEL_ID || "amazon.nova-lite-v1:0";
const BEDROCK_REGION = process.env.AWS_REGION || process.env.BEDROCK_REGION || "us-east-1";

let bedrockClient = null;

function getBedrockClient() {
  if (!bedrockClient) {
    bedrockClient = new BedrockRuntimeClient({ region: BEDROCK_REGION });
  }
  return bedrockClient;
}

function fallbackAction(product) {
  if ((product.riskType || "").includes("Stockout")) {
    return "Replenish within next cycle and monitor daily sales changes.";
  }
  if ((product.riskType || "").includes("Dead")) {
    return "Reduce reorder quantity and plan markdown or bundle strategy.";
  }
  return "Keep current policy and continue monitoring demand trend.";
}

function fallbackUrgency(product) {
  if ((product.riskType || "").startsWith("High")) return "High";
  if ((product.riskType || "").startsWith("Medium")) return "Medium";
  return "Low";
}

function extractJson(text) {
  if (!text) return null;
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch (innerErr) {
        return null;
      }
    }
    return null;
  }
}

async function invokeConverse(promptText, maxTokens) {
  const command = new ConverseCommand({
    modelId: DEFAULT_MODEL_ID,
    messages: [
      {
        role: "user",
        content: [{ text: promptText }],
      },
    ],
    inferenceConfig: {
      maxTokens,
      temperature: 0.2,
    },
  });

  const response = await getBedrockClient().send(command);
  const content = response?.output?.message?.content || [];
  const text = content
    .map((item) => (item && item.text ? item.text : ""))
    .join("\n")
    .trim();
  return text;
}

async function generateExplanationWithBedrock(product) {
  const promptText =
    "You are a retail inventory analyst. Return strict JSON with keys: explanation, recommendedAction, urgencyLevel.\n" +
    "Use plain business language in 2 concise sentences each.\n" +
    `RiskType=${product.riskType}\n` +
    `DaysOfCover=${product.daysOfCoverLabel || product.daysOfCover}\n` +
    `SellThrough30d=${product.sellThrough30d}\n` +
    `DemandTrend=${product.demandTrend}\n` +
    `DemandSpike=${product.demandSpike}\n` +
    `RiskReason=${product.riskReason}`;

  const text = await invokeConverse(promptText, 180);
  const parsed = extractJson(text);
  if (parsed) {
    return {
      explanation: parsed.explanation || product.explanation,
      recommendedAction: parsed.recommendedAction || fallbackAction(product),
      urgencyLevel: parsed.urgencyLevel || fallbackUrgency(product),
    };
  }
  return {
    explanation: product.explanation,
    recommendedAction: fallbackAction(product),
    urgencyLevel: fallbackUrgency(product),
  };
}

function fallbackExecutiveSummary(summary) {
  return [
    `${summary.totalProducts} SKUs were evaluated across the portfolio.`,
    `${summary.highRiskCount} SKUs are in the high-risk bucket and need immediate review.`,
    `Estimated revenue at risk is INR ${summary.totalRevenueAtRisk.toLocaleString("en-IN")}.`,
    `Estimated blocked working capital is INR ${summary.totalCapitalBlocked.toLocaleString("en-IN")}.`,
    "Focus replenishment on stockout risks and markdown planning on slow-moving inventory.",
  ];
}

async function generateExecutiveSummaryWithBedrock(summary) {
  const promptText =
    "Summarize inventory health for a retail leadership team in 5 bullet points.\n" +
    "Return strict JSON with key bullets as an array of 5 concise strings.\n" +
    `TotalSKUs=${summary.totalProducts}\n` +
    `HighRiskSKUs=${summary.highRiskCount}\n` +
    `RiskDistribution=${JSON.stringify(summary.riskDistribution)}\n` +
    `RevenueAtRiskINR=${summary.totalRevenueAtRisk}\n` +
    `CapitalBlockedINR=${summary.totalCapitalBlocked}`;

  const text = await invokeConverse(promptText, 220);
  const parsed = extractJson(text);
  if (parsed && Array.isArray(parsed.bullets) && parsed.bullets.length) {
    return parsed.bullets.slice(0, 5);
  }
  return fallbackExecutiveSummary(summary);
}

module.exports = {
  generateExplanationWithBedrock,
  generateExecutiveSummaryWithBedrock,
  fallbackAction,
  fallbackExecutiveSummary,
  fallbackUrgency,
};
