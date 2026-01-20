import YahooFinance from "yahoo-finance2";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { loadEnvFile } from "node:process";
loadEnvFile();

const config = {
  dataUrl: process.env.DATA_URL,
  s3Bucket: process.env.S3_BUCKET_NAME,
  s3Key: process.env.S3_FILE_KEY,
  awsRegion: process.env.AWS_REGION,
};

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey", "ripHistorical"],
});

const s3Client = new S3Client({ region: config.awsRegion });

/**
 * Fetches historical price using the v3 chart() API
 */
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

/**
 * Main Logic
 */
async function main() {
  try {
    let currentPage = 1;
    let totalPages = 1;
    let allItems = [];

    // --- PHASE 1: COLLECT ALL TICKERS FROM ALL PAGES ---
    console.log(`Starting pagination crawl at: ${config.dataUrl}`);

    do {
      const url = new URL(config.dataUrl);
      url.searchParams.append("page", currentPage);

      console.log(`Fetching page ${currentPage}...`);
      const response = await fetch(url.toString());
      const data = await response.json();

      // Add items from this page to our master list
      if (data.items) {
        allItems = allItems.concat(data.items);
      }

      // Update pagination state based on API response
      totalPages = data.totalPages;
      currentPage++;
    } while (currentPage <= totalPages);

    // Get unique list of tickers
    const tickers = [
      ...new Set(allItems.map((i) => i.yahooFinanceTicker)),
    ].filter(Boolean);
    console.log(
      `Crawl complete. Found ${tickers.length} unique tickers across all pages.`
    );

    // --- PHASE 2: PROCESS TICKERS ---
    const results = [];
    for (const ticker of tickers) {
      try {
        console.log(`Querying Yahoo: ${ticker}`);
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

        // Sleep for 200ms to stay under Yahoo rate limits
        await new Promise((r) => setTimeout(r, 200));
      } catch (e) {
        console.warn(`Error on ${ticker}: ${e.message}`);
      }
    }

    // --- PHASE 3: UPLOAD TO S3 ---
    await s3Client.send(
      new PutObjectCommand({
        Bucket: config.s3Bucket,
        Key: config.s3Key,
        Body: JSON.stringify(results, null, 2),
        ContentType: "application/json",
      })
    );

    console.log(`Successfully uploaded ${results.length} results to S3.`);
  } catch (err) {
    console.error("Fatal Error:", err);
  }
}

main();
