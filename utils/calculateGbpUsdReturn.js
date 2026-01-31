/**
 * Calculate GBP return of a USD fund over 1 year
 *
 * @param {number} usdFundReturnPct - USD fund return (e.g. 7.35 for 7.35%)
 * @param {number} gbpUsdReturnPct  - GBP/USD return (e.g. 10.15 for 10.15%)
 * @returns {number} GBP return (percentage)
 */
export default function calculateGbpUsdReturn(usdFundReturnPct, gbpUsdReturnPct) {
  const usdFundReturn = usdFundReturnPct / 100;
  const gbpUsdReturn = gbpUsdReturnPct / 100;
  
  return parseFloat((((1 + usdFundReturn) / (1 + gbpUsdReturn) - 1) * 100).toFixed(2));
}