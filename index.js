import YahooFinance from 'yahoo-finance2';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { loadEnvFile } from 'node:process';
loadEnvFile();


const config = {
    dataUrl: process.env.DATA_URL,
    s3Bucket: process.env.S3_BUCKET_NAME,
    s3Key: process.env.S3_FILE_KEY || 'processed-data.json',
    awsRegion: process.env.AWS_REGION || 'us-east-1'
};

// Validate critical variables
for (const [key, value] of Object.entries(config)) {
    if (!value && key !== 's3Key') {
        throw new Error(`Missing environment variable for ${key}`);
    }
}

const yahooFinance = new YahooFinance();

// The SDK automatically looks for AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY
const s3Client = new S3Client({ region: config.awsRegion });

async function getHistoricalPrice(symbol, targetDate) {
    const p1 = new Date(targetDate); p1.setDate(p1.getDate() - 5);
    const p2 = new Date(targetDate); p2.setDate(p2.getDate() + 5);

    try {
        const result = await yahooFinance.historical(symbol, {
            period1: p1.toISOString().split('T')[0],
            period2: p2.toISOString().split('T')[0],
            interval: '1d',
        });
        if (!result?.length) return null;
        const closest = result.reduce((p, c) => 
            Math.abs(new Date(c.date) - targetDate) < Math.abs(new Date(p.date) - targetDate) ? c : p
        );
        return closest.close;
    } catch { return null; }
}

async function main() {
    try {
        console.log(`Fetching records from: ${config.dataUrl}`);
        const response = await fetch(config.dataUrl);
        const data = await response.json();
        
        const tickers = [...new Set(data.items.map(i => i.yahooFinanceTicker))].filter(Boolean);
        const results = [];

        for (const ticker of tickers) {
            try {
                const quote = await yahooFinance.quote(ticker);
                const currentPrice = quote.regularMarketPrice;

                const date1M = new Date(); date1M.setMonth(date1M.getMonth() - 1);
                const date1Y = new Date(); date1Y.setFullYear(date1Y.getFullYear() - 1);

                const price1M = await getHistoricalPrice(ticker, date1M);
                const price1Y = await getHistoricalPrice(ticker, date1Y);

                const calcPct = (c, p) => p ? parseFloat(((c - p) / p * 100).toFixed(2)) : null;

                results.push({
                    yahooFinanceTicker: ticker,
                    price: currentPrice,
                    oneYear: calcPct(currentPrice, price1Y),
                    oneMonth: calcPct(currentPrice, price1M),
                    updatedAt: new Date().toISOString()
                });
                
                // Throttle requests slightly
                await new Promise(r => setTimeout(r, 200));
            } catch (e) { console.warn(`Error on ${ticker}: ${e.message}`); }
        }

        await s3Client.send(new PutObjectCommand({
            Bucket: config.s3Bucket,
            Key: config.s3Key,
            Body: JSON.stringify(results, null, 2),
            ContentType: 'application/json'
        }));

        console.log('Successfully uploaded to S3.');
    } catch (err) { console.error('Service Failed:', err); }
}

main();