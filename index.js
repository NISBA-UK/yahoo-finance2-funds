import { loadEnvFile } from "node:process";
loadEnvFile();

import YahooFinance from "yahoo-finance2";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import sendErrorEmail from "./utils/sendErrorEmail.js";
import getHistoricalPrice from "./utils/getHistoricalPrice.js";
import { config } from "./config.js";

// Initialize Yahoo Finance v3 with suppressed notices
const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey", "ripHistorical"],
});

const s3Client = new S3Client({ region: config.awsRegion });

/**
 * Main Scraper Execution
 */
async function main() {
  try {
    let currentPage = 1;
    let totalPages = 1;
    let allItems = [];

    // --- PHASE 1: PAGINATION CRAWL ---
    console.log(`Starting pagination crawl at: ${config.dataUrl}`);

    do {
      const url = new URL(config.dataUrl);
      url.searchParams.append("page", currentPage.toString());

      console.log(`Fetching page ${currentPage}...`);
      const response = await fetch(url.toString());

      if (!response.ok) throw new Error(`API Fetch failed: ${response.status}`);

      const data = await response.json();
      if (data.items) {
        allItems = allItems.concat(data.items);
      }

      totalPages = data.totalPages || 1;
      currentPage++;
    } while (currentPage <= totalPages);

    // Deduplicate tickers
    const tickers = [
      ...new Set(allItems.map((i) => i.yahooFinanceTicker)),
    ].filter(Boolean);
    console.log(
      `Crawl complete. Found ${tickers.length} unique tickers across all pages.`
    );

    // --- PHASE 2: PROCESSING ---
    const results = [];
    const date1M = new Date();
    date1M.setMonth(date1M.getMonth() - 1);
    const date1Y = new Date();
    date1Y.setFullYear(date1Y.getFullYear() - 1);

    for (const ticker of tickers) {
      try {
        console.log(`Querying Yahoo: ${ticker}`);

        const quote = await yahooFinance.quote(ticker);
        const currentPrice = quote.regularMarketPrice;

        const price1M = await getHistoricalPrice(ticker, date1M);
        const price1Y = await getHistoricalPrice(ticker, date1Y);

        const calcPct = (c, p) =>
          p ? parseFloat((((c - p) / p) * 100).toFixed(2)) : null;

        results.push({
          yahooFinanceTicker: ticker,
          price: currentPrice,
          oneYear: calcPct(currentPrice, price1Y),
          oneMonth: calcPct(currentPrice, price1M),
        });

        // Respect rate limits
        await new Promise((r) => setTimeout(r, 200));
      } catch (tickerErr) {
        console.warn(
          `Skipping ${ticker} due to Yahoo error: ${tickerErr.message}`
        );
      }
    }

    // --- PHASE 3: S3 UPLOAD ---
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
    console.error("FATAL ERROR:", err.message);
    await sendErrorEmail(err.message);
    process.exit(1);
  }
}

main();
