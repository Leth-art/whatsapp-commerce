/**
 * announcements.js — Système d'annonces admin
 * - Sauvegarde en DB
 * - Envoi emails aux commerçants
 * - Bandeau sur le site
 */

const { Merchant } = require("../models/index");

// ─── Envoi email via nodemailer ───────────────────────────────────────────────
const sendAnnouncementEmails = async (subject, htmlContent, textContent) => {
  const EMAIL_USER = process.env.EMAIL_USER;
  const EMAIL_PASS = process.env.EMAIL_PASS;

  if (!EMAIL_USER || !EMAIL_PASS) {
    console.warn("⚠️ EMAIL_USER/EMAIL_PASS non configurés — emails non envoyés");
    return { sent: 0, failed: 0, skipped: true };
  }

  let nodemailer;
  try {
    nodemailer = require("nodemailer");
  } catch {
    console.warn("⚠️ nodemailer non installé — npm install nodemailer");
    return { sent: 0, failed: 0, skipped: true };
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  });

  // Récupère tous les commerçants avec email
  const merchants = await Merchant.findAll({ where: { isActive: true } });
  const withEmail = merchants.filter(m => m.email && m.email.includes("@"));

  let sent = 0;
  let failed = 0;

  for (const merchant of withEmail) {
    try {
      await transporter.sendMail({
        from: `WaziBot <${EMAIL_USER}>`,
        to: merchant.email,
        subject: `📢 ${subject}`,
        text: textContent,
        html: `
          <!DOCTYPE html>
          <html>
          <head><meta charset="UTF-8"></head>
          <body style="font-family:Arial,sans-serif;background:#f5f5f8;padding:20px;">
            <div style="max-width:560px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;border:1px solid #e4e4ef;">
              <div style="background:#e85c0e;padding:24px 32px;">
                <h1 style="color:white;margin:0;font-size:20px;">Wazi<span style="color:#ffcc99;">Bot</span></h1>
              </div>
              <div style="padding:32px;">
                <h2 style="color:#0a0a14;font-size:18px;margin-bottom:16px;">${subject}</h2>
                <div style="color:#3a3a5a;font-size:15px;line-height:1.7;">${htmlContent}</div>
              </div>
              <div style="background:#f8f8fb;padding:20px 32px;border-top:1px solid #e4e4ef;text-align:center;">
                <p style="color:#6a6a8a;font-size:12px;margin:0;">
                  Vous recevez cet email car vous êtes inscrit sur WaziBot.<br>
                  <a href="mailto:salemkingrosetho@gmail.com" style="color:#e85c0e;">salemkingrosetho@gmail.com</a>
                </p>
              </div>
            </div>
          </body>
          </html>
        `,
      });
      sent++;
      await new Promise(r => setTimeout(r, 300)); // anti-spam delay
    } catch (err) {
      console.error(`❌ Email failed for ${merchant.email}:`, err.message);
      failed++;
    }
  }

  console.log(`📧 Emails: ${sent} envoyés, ${failed} échecs, ${withEmail.length} total`);
  return { sent, failed, total: withEmail.length };
};

module.exports = { sendAnnouncementEmails };
