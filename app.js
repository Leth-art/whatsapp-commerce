require("dotenv").config();
const express = require("express");
const path = require("path");
const { connectDB } = require("./config/database");
const webhookRouter = require("./routes/webhook");
const apiRouter = require("./routes/api");
const subscriptionsRouter = require("./routes/subscriptions");
const onboardingRouter = require("./routes/onboarding");
const { startCronJobs } = require("./modules/retention");

const app = express();
const PORT = process.env.PORT || 3000;

connectDB().then(() => { startCronJobs(); });

app.use(express.static(__dirname));

app.use((req, res, next) => {
  if ((req.originalUrl === "/webhook" || req.originalUrl === "/subscription/webhook") && req.method === "POST") return next();
  express.json()(req, res, next);
});

// ── Middleware API Key — protège /api et /subscription ──
const requireApiKey = (req, res, next) => {
  const key = req.headers["x-api-key"] || req.query.apiKey;
  const validKey = process.env.API_SECRET_KEY;
  if (!validKey || key === validKey) return next();
  return res.status(401).json({ error: "Accès non autorisé. Clé API invalide." });
};

// ── Middleware Admin — protège /admin côté serveur ──
const requireAdminToken = (req, res, next) => {
  const token = req.query.token;
  const validToken = process.env.ADMIN_SECRET_TOKEN;
  if (!validToken || token === validToken) return next();
  return res.status(403).sendFile(path.join(__dirname, "403.html"));
};

// ── Routes publiques (sans protection) ──
app.use("/webhook", webhookRouter);
app.use("/onboarding", onboardingRouter); // nécessaire pour signup

// ── Routes protégées par API Key ──
app.use("/api", requireApiKey, apiRouter);
app.use("/subscription", requireApiKey, subscriptionsRouter);

// ── Pages HTML ──
app.get("/", (req, res) => { res.sendFile(path.join(__dirname, "index.html")); });
app.get("/signup", (req, res) => { res.sendFile(path.join(__dirname, "signup.html")); });
app.get("/privacy", (req, res) => { res.sendFile(path.join(__dirname, "privacy.html")); });
app.get("/dashboard", (req, res) => { res.sendFile(path.join(__dirname, "dashboard.html")); });
app.get("/admin", requireAdminToken, (req, res) => { res.sendFile(path.join(__dirname, "admin.html")); });

app.use((err, req, res, next) => { console.error("Erreur :", err.message); res.status(500).json({ error: "Erreur interne" }); });

app.listen(PORT, () => {
  console.log("🚀 Serveur démarré sur http://localhost:" + PORT);
  console.log("📊 Dashboard : http://localhost:" + PORT + "/dashboard");
  console.log("🔐 Admin : http://localhost:" + PORT + "/admin?token=VOTRE_TOKEN");
  console.log("📡 Webhook : http://localhost:" + PORT + "/webhook");
  console.log("📋 API : http://localhost:" + PORT + "/api (x-api-key requis)");
});

module.exports = app;