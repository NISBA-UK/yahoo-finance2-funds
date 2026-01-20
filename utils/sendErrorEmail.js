import nodemailer from "nodemailer";
import { config } from "../config.js";

export default async function sendErrorEmail(errorMessage) {
  if (!config.emailUser || !config.emailPass) return;

  const transporter = nodemailer.createTransport({
    host: config.emailHost,
    port: config.emailPort,
    secure: config.emailPort === 465,
    auth: { user: config.emailUser, pass: config.emailPass },
  });

  try {
    await transporter.sendMail({
      from: `"Scraper Alert" <${config.emailUser}>`,
      to: config.emailTo,
      subject: "🚨 Financial Scraper Failure",
      text: `The scraper failed at ${new Date().toISOString()}.\n\nError: ${errorMessage}`,
    });
    console.log("Error email alert sent.");
  } catch (e) {
    console.error("Failed to send email alert:", e.message);
  }
}
