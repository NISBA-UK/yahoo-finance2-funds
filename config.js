import { loadEnvFile } from "node:process";
import { join } from "node:path";

// 1. Try to load from /app (Coolify/Docker path)
// 2. Fallback to loading from the current directory (Local Dev)
try {
  loadEnvFile(join("/app", ".env"));
} catch (error) {
  try {
    // If /app/.env fails, try loading .env from where you ran the command
    loadEnvFile();
  } catch (localError) {
    // If both fail, we don't crash. Coolify injects vars via process.env directly.
    if (localError.code !== "ENOENT") throw localError;
    console.info("ℹ️ No .env file found; using system environment variables.");
  }
}

export const config = {
  dataUrl: process.env.DATA_URL,
  s3Bucket: process.env.S3_BUCKET_NAME,
  s3Key: process.env.S3_FILE_KEY || "ticker-stats.json",
  awsRegion: process.env.AWS_REGION || "us-east-1",
  emailHost: process.env.EMAIL_HOST,
  emailPort: parseInt(process.env.EMAIL_PORT || "465"),
  emailUser: process.env.EMAIL_USER,
  emailPass: process.env.EMAIL_PASS,
  emailTo: process.env.EMAIL_TO,
};
