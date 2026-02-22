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

app.use("/webhook", webhookRouter);
app.use("/api", apiRouter);
app.use("/subscription", subscriptionsRouter);
app.use("/onboarding", onboardingRouter);

app.get("/dashboard", (req, res) => { res.sendFile(path.join(__dirname, "dashboard.html")); });
app.get("/admin", (req, res) => { res.sendFile(path.join(__dirname, "admin.html")); });
app.get("/signup", (req, res) => { res.sendFile(path.join(__dirname, "signup.html")); });
app.get("/privacy", (req, res) => { res.sendFile(path.join(__dirname, "privacy.html")); });
app.get("/", (req, res) => { res.sendFile(path.join(__dirname, "index.html")); });

app.use((err, req, res, next) => { console.error("Erreur :", err.message); res.status(500).json({ error: "Erreur interne" }); });

app.listen(PORT, () => {
  console.log("🚀 Serveur démarré sur http://localhost:" + PORT);
  console.log("📊 Dashboard : http://localhost:" + PORT + "/dashboard");
  console.log("🔐 Admin : http://localhost:" + PORT + "/admin");
  console.log("📡 Webhook : http://localhost:" + PORT + "/webhook");
  console.log("📋 API : http://localhost:" + PORT + "/api");
});

module.exports = app;