const express = require("express");
const router = express.Router();
const speakeasy = require("speakeasy");
const QRCode = require("qrcode");
const { Merchant } = require("../models/index");

router.post("/setup/:merchantId", async (req, res) => {
  try {
    const merchant = await Merchant.findByPk(req.params.merchantId);
    if (!merchant) return res.status(404).json({ error: "Introuvable" });
    const secret = speakeasy.generateSecret({ name: `WaziBot (${merchant.name})`, issuer: "WaziBot", length: 20 });
    await merchant.update({ totpSecret: secret.base32, totpEnabled: false });
    const qrCode = await QRCode.toDataURL(secret.otpauth_url);
    res.json({ success: true, qrCode, secret: secret.base32 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/enable/:merchantId", async (req, res) => {
  try {
    const { code } = req.body;
    const merchant = await Merchant.findByPk(req.params.merchantId);
    if (!merchant || !merchant.totpSecret) return res.status(400).json({ error: "Setup requis" });
    const valid = speakeasy.totp.verify({ secret: merchant.totpSecret, encoding: "base32", token: String(code), window: 2 });
    if (!valid) return res.status(401).json({ error: "Code incorrect" });
    await merchant.update({ totpEnabled: true });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/verify/:merchantId", async (req, res) => {
  try {
    const { code } = req.body;
    const merchant = await Merchant.findByPk(req.params.merchantId);
    if (!merchant) return res.status(404).json({ error: "Introuvable" });
    if (!merchant.totpEnabled) return res.json({ success: true, required: false });
    const valid = speakeasy.totp.verify({ secret: merchant.totpSecret, encoding: "base32", token: String(code), window: 2 });
    if (!valid) return res.status(401).json({ error: "Code incorrect", required: true });
    res.json({ success: true, required: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/status/:merchantId", async (req, res) => {
  try {
    const merchant = await Merchant.findByPk(req.params.merchantId);
    if (!merchant) return res.status(404).json({ error: "Introuvable" });
    res.json({ enabled: merchant.totpEnabled || false });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/verify-admin", (req, res) => {
  try {
    const { code } = req.body;
    const adminSecret = process.env.ADMIN_TOTP_SECRET;
    if (!adminSecret) return res.json({ success: true });
    const valid = speakeasy.totp.verify({ secret: adminSecret, encoding: "base32", token: String(code), window: 2 });
    res.json({ success: valid });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
