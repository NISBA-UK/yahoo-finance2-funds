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
