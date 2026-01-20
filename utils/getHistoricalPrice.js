export default async function getHistoricalPrice(symbol, targetDate) {
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
