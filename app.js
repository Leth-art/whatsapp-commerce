require("dotenv").config();
const express = require("express");
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});
const { connectDB } = require("./config/database");
const webhookRouter = require("./routes/webhook");
const apiRouter = require("./routes/api");
const subscriptionsRouter = require("./routes/subscriptions");
const onboardingRouter = require("./routes/onboarding");
const { startCronJobs } = require("./modules/retention");

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Base de données ───
connectDB().then(() => {
  startCronJobs();
});

// ─── Fichiers statiques (dashboard) ───
app.use(express.static(__dirname));

// ─── Middlewares ───
app.use((req, res, next) => {
  if ((req.originalUrl === "/webhook" || req.originalUrl === "/subscription/webhook") && req.method === "POST") return next();
  express.json()(req, res, next);
});

// ─── Routes ───
app.use("/webhook", webhookRouter);
app.use("/api", apiRouter);
app.use("/subscription", subscriptionsRouter);
app.use("/onboarding", onboardingRouter);

// ─── Dashboard ───
app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "dashboard.html"));
});

// ─── Santé ───
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});
// ─── Erreurs ───
app.use((err, req, res, next) => {
  console.error("Erreur :", err.message);
  res.status(500).json({ error: "Erreur interne" });
});

app.listen(PORT, () => {
  console.log("🚀 Serveur démarré sur http://localhost:" + PORT);
  console.log("📊 Dashboard : http://localhost:" + PORT + "/dashboard");
  console.log("📡 Webhook WhatsApp : http://localhost:" + PORT + "/webhook");
  console.log("📋 API REST : http://localhost:" + PORT + "/api");
  console.log("🎯 Onboarding : http://localhost:" + PORT + "/onboarding");
});

module.exports = app;
