import "dotenv/config";
import YahooFinance from "yahoo-finance2";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import sendErrorEmail from "./utils/sendErrorEmail.js";
import getHistoricalPrice from "./utils/getHistoricalPrice.js";
import { config } from "./config.js";
import getFundImage from "./utils/getFundImage.js";
import calculateGbpUsdReturn from "./utils/calculateGbpUsdReturn.js";
import getGbpUsdReturn from "./utils/getGBPUSDReturn.js";

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey", "ripHistorical"],
});

const s3Client = new S3Client({ region: config.awsRegion });

async function main() {
  try {
    let currentPage = 1;
    let totalPages = 1;
    let allItems = [];

    // --- PHASE 1: PAGINATION CRAWL ---
    console.log(`Starting pagination crawl at: ${config.dataUrl}`);

    do {
      const url = new URL(`${config.dataUrl}/collections/fund/records`);
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

    // Filter out items without a valid Yahoo ticker
    const validItems = allItems.filter((item) => item.yahooFinanceTicker);

    console.log(`Crawl complete. Found ${validItems.length} items to process.`);

    // --- PHASE 2: PROCESSING ---
    const results = [];
    const date1M = new Date();
    date1M.setMonth(date1M.getMonth() - 1);
    const date1Y = new Date();
    date1Y.setFullYear(date1Y.getFullYear() - 1);

    const gbpUsdReturn1Y = await getGbpUsdReturn(date1Y);
    const gbpUsdReturn1M = await getGbpUsdReturn(date1M);

    for (const item of validItems) {
      const ticker = item.yahooFinanceTicker;
      try {
        console.log(`Querying Yahoo: ${ticker}`);

        const quote = await yahooFinance.quote(ticker);
        const currentPrice = quote.regularMarketPrice;

        const price1M = await getHistoricalPrice(yahooFinance, ticker, date1M);
        const price1Y = await getHistoricalPrice(yahooFinance, ticker, date1Y);

        const calcPct = (c, p) =>
          p ? parseFloat((((c - p) / p) * 100).toFixed(2)) : null;
        const fundImageData = await getFundImage(item.fundImage);
        const oneYear = calcPct(currentPrice, price1Y);
        const oneMonth = calcPct(currentPrice, price1M);

        results.push({
          fundName: item.fundName,
          fundImage: item.fundImage
            ? `${config.dataUrl}/files/${fundImageData}`
            : null,
          assetClass: item.assetClass,
          currency: item.currency,
          yahooFinanceTicker: ticker,
          ticker: item.ticker,
          fee: item.fee,
          geoFocus: item.geoFocus,
          accumulationOrIncome: item.accumulationOrIncome,
          dividendPurification: item.dividendPurification,
          activeOrPassive: item.activeOrPassive,
          investmentType: item.investmentType, // API uses 'investmentType' for ETF/Fund
          currencyDenomination: item.currencyDenomination,
          brokerAvailability: item.brokerAvailability,
          price: currentPrice,
          oneYear: oneYear,
          oneMonth: oneMonth,
          oneYearGBPUSD: item.currency === "USD" ? calculateGbpUsdReturn(oneYear, gbpUsdReturn1Y) : null,
          oneMonthGBPUSD: item.currency === "USD" ? calculateGbpUsdReturn(oneMonth, gbpUsdReturn1M) : null,
          showInProd: item.showInProd,
          updatedAt: new Date().toISOString(),
        });

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

const TIME_DELAY = 60 * 60 * 1000;
setInterval(main, TIME_DELAY);