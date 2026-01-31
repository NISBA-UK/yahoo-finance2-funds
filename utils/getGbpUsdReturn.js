import YahooFinance from "yahoo-finance2";
import sendErrorEmail from "./sendErrorEmail.js";

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey", "ripHistorical"],
});

export default async function getGbpUsdReturn(date) {
  try {
    const quote = await yahooFinance.quote("GBPUSD=X");
    const currentPrice = quote.regularMarketPrice;
    const p1 = new Date(date);
    p1.setDate(p1.getDate() - 5);
    const p2 = new Date(date);
    p2.setDate(p2.getDate() + 5);

    const hist = await yahooFinance.historical("GBPUSD=X", {
      period1: p1.toISOString().split("T")[0],
      period2: p2.toISOString().split("T")[0],
      interval: "1d",
    });

    if (hist && hist.length > 0) {
      const pastPrice = hist[0].close;
      return parseFloat(
        (((currentPrice - pastPrice) / pastPrice) * 100).toFixed(2)
      );
    } else {
      return null;
    }
  } catch (err) {
    console.error("FATAL ERROR:", err.message);
    await sendErrorEmail(err.message);
    process.exit(1);
  }
}