import { loadEnvFile } from "node:process";
import YahooFinance from "yahoo-finance2";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import nodemailer from "nodemailer";
loadEnvFile();

const config = {
  dataUrl: process.env.DATA_URL,
  s3Bucket: process.env.S3_BUCKET_NAME,
  s3Key: process.env.S3_FILE_KEY || "ticker-stats.json",
  awsRegion: process.env.AWS_REGION || "us-east-1",
  // Email Config
  emailHost: process.env.EMAIL_HOST,
  emailPort: parseInt(process.env.EMAIL_PORT || "465"),
  emailUser: process.env.EMAIL_USER,
  emailPass: process.env.EMAIL_PASS,
  emailTo: process.env.EMAIL_TO,
};

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey", "ripHistorical"],
});
const s3Client = new S3Client({ region: config.awsRegion });

/**
 * Sends an email notification on failure
 */
async function sendErrorEmail(errorMessage) {
  if (!config.emailUser || !config.emailPass) {
    console.error("Email credentials missing. Cannot send alert.");
    return;
  }

  const transporter = nodemailer.createTransport({
    host: config.emailHost,
    port: config.emailPort,
    secure: config.emailPort === 465,
    auth: { user: config.emailUser, pass: config.emailPass },
  });

  const mailOptions = {
    from: `"Scraper Alert" <${config.emailUser}>`,
    to: config.emailTo,
    subject: "🚨 Financial Scraper Failure",
    text: `The financial data scraper failed at ${new Date().toISOString()}.\n\nError: ${errorMessage}`,
    html: `<h2 style="color: red;">Scraper Failure Alert</h2>
               <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
               <p><strong>Error Message:</strong> ${errorMessage}</p>`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("Error email sent successfully.");
  } catch (e) {
    console.error("Failed to send error email:", e.message);
  }
}

async function getHistoricalPrice(symbol, targetDate) {
  const p1 = new Date(targetDate);
  p1.setDate(p1.getDate() - 5);
  const p2 = new Date(targetDate);
  p2.setDate(p2.getDate() + 5);
  try {
    const result = await yahooFinance.chart(symbol, {
      period1: p1.toISOString().split("T")[0],
      period2: p2.toISOString().split("T")[0],
      interval: "1d",
    });
    if (!result?.quotes?.length) return null;
    const closest = result.quotes.reduce((p, c) =>
      Math.abs(new Date(c.date) - targetDate) <
      Math.abs(new Date(p.date) - targetDate)
        ? c
        : p
    );
    return closest.close;
  } catch {
    return null;
  }
}

async function main() {
  try {
    let currentPage = 1;
    let totalPages = 1;
    let allItems = [];

    // PHASE 1: CRAWL PAGES
    console.log("Starting data crawl...");
    do {
      const url = new URL(config.dataUrl);
      url.searchParams.append("page", currentPage.toString());

      const response = await fetch(url.toString());
      if (!response.ok)
        throw new Error(`API Fetch failed with status ${response.status}`);

      const data = await response.json();
      if (data.items) allItems = allItems.concat(data.items);

      totalPages = data.totalPages || 1;
      currentPage++;
    } while (currentPage <= totalPages);

    const tickers = [
      ...new Set(allItems.map((i) => i.yahooFinanceTicker)),
    ].filter(Boolean);
    const results = [];

    // PHASE 2: YAHOO FINANCE PROCESSING
    for (const ticker of tickers) {
      try {
        const quote = await yahooFinance.quote(ticker);
        const currentPrice = quote.regularMarketPrice;
        const date1M = new Date();
        date1M.setMonth(date1M.getMonth() - 1);
        const date1Y = new Date();
        date1Y.setFullYear(date1Y.getFullYear() - 1);
        const price1M = await getHistoricalPrice(ticker, date1M);
        const price1Y = await getHistoricalPrice(ticker, date1Y);
        const calcPct = (c, p) =>
          p ? parseFloat((((c - p) / p) * 100).toFixed(2)) : null;

        results.push({
          yahooFinanceTicker: ticker,
          price: currentPrice,
          oneYear: calcPct(currentPrice, price1Y),
          oneMonth: calcPct(currentPrice, price1M),
          updatedAt: new Date().toISOString(),
        });
        await new Promise((r) => setTimeout(r, 200));
      } catch (e) {
        console.warn(`Non-fatal: Skipping ${ticker} due to error.`);
      }
    }

    // PHASE 3: S3 UPLOAD
    await s3Client.send(
      new PutObjectCommand({
        Bucket: config.s3Bucket,
        Key: config.s3Key,
        Body: JSON.stringify(results, null, 2),
        ContentType: "application/json",
      })
    );

    console.log("Process finished successfully.");
  } catch (err) {
    console.error("FATAL ERROR:", err.message);
    // TRIGGER EMAIL LOGGING ON FAILURE
    await sendErrorEmail(err.message);
    process.exit(1);
  }
}

main();
