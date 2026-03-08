const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const S3_BUCKET = process.env.S3_BUCKET || "";

let s3Client = null;
function getS3Client() {
  if (!s3Client) s3Client = new S3Client({ region: AWS_REGION });
  return s3Client;
}

function enabled() {
  return Boolean(S3_BUCKET);
}

async function putObject(key, body, contentType) {
  if (!enabled()) return null;
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
  });
  await getS3Client().send(command);
  return `s3://${S3_BUCKET}/${key}`;
}

async function storeUploadAndResult(params) {
  if (!enabled()) return null;
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const prefix = process.env.S3_PREFIX || "inventory-risk";
  const uploadKey = `${prefix}/uploads/${ts}-${params.mode || "normal"}-test.csv`;
  const resultKey = `${prefix}/results/${ts}-${params.mode || "normal"}-result.json`;

  const uploadUri = await putObject(uploadKey, params.uploadBuffer, "text/csv");
  const resultUri = await putObject(resultKey, JSON.stringify({ products: params.products }, null, 2), "application/json");
  return { uploadUri, resultUri };
}

module.exports = {
  enabled,
  storeUploadAndResult,
};
