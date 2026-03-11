require("dotenv").config();
const express = require("express");
const path = require("path");
const { connectDB } = require("./config/database");
const webhookRouter = require("./routes/webhook");
const apiRouter = require("./routes/api");
const subscriptionsRouter = require("./routes/subscriptions");
const onboardingRouter = require("./routes/onboarding");
const analyticsRouter = require("./routes/analytics");
const { startCronJobs } = require("./modules/retention");
const { initRedis } = require("./core/cache");
const { initQueue } = require("./core/messageQueue");
const { runIndexMigration } = require("./migrations/addIndexes");
const { initRateLimiter } = require("./core/rateLimiter");

const app = express();
const PORT = process.env.PORT || 3000;

connectDB().then(async () => {
  try {
    const { sequelize } = require("./config/database");

    const constraints = await sequelize.query(`
      SELECT constraint_name FROM information_schema.table_constraints 
      WHERE table_name = 'Merchants' AND constraint_type = 'UNIQUE'
      AND constraint_name LIKE '%phoneNumberId%'
    `, { type: sequelize.QueryTypes.SELECT });

    for (const row of constraints) {
      await sequelize.query(`ALTER TABLE "Merchants" DROP CONSTRAINT IF EXISTS "${row.constraint_name}"`);
    }

    await sequelize.query(`ALTER TABLE "Merchants" DROP CONSTRAINT IF EXISTS "Merchants_phoneNumberId_key35"`).catch(() => {});
    await sequelize.query(`ALTER TABLE "Merchants" ALTER COLUMN "phoneNumberId" DROP NOT NULL`).catch(() => {});
    await sequelize.query(`ALTER TABLE "Merchants" ALTER COLUMN "whatsappToken" DROP NOT NULL`).catch(() => {});
    await sequelize.sync({ alter: true });
    console.log("✅ Base de données migrée et synchronisée");

    // Prompt 3 : Index DB
    await runIndexMigration().catch(err => console.warn("⚠️ Index migration:", err.message));
  } catch (err) {
    console.error("⚠️ Erreur migration DB:", err.message);
  }

  // Prompt 1 : Redis Cache
  await initRedis().catch(() => {});

  // Prompt 4 : Rate Limiter
  let sharedRedis = null;
  try {
    if (process.env.REDIS_URL) {
      const { createClient } = require("redis");
      sharedRedis = createClient({ url: process.env.REDIS_URL });
      await sharedRedis.connect();
    }
  } catch {}
  await initRateLimiter(sharedRedis).catch(() => {});

  // Prompt 2 : Queue
  await initQueue().catch(() => {});

  startCronJobs();
});

app.use((req, res, next) => {
  if ((req.originalUrl === "/webhook" || req.originalUrl === "/subscription/webhook") && req.method === "POST") return next();
  express.json()(req, res, next);
});

const requireApiKey = (req, res, next) => {
  const key = req.headers["x-api-key"] || req.query.apiKey;
  const validKey = process.env.API_SECRET_KEY;
  if (!validKey || key === validKey) return next();
  return res.status(401).json({ error: "Accès non autorisé. Clé API invalide." });
};

const requireAdminToken = (req, res, next) => {
  const token = req.query.token;
  const validToken = process.env.ADMIN_SECRET_TOKEN;
  if (!validToken || token === validToken) return next();
  return res.status(403).sendFile(path.join(__dirname, "403.html"));
};

const maintenanceMode = (req, res, next) => {
  const isMaintenance = process.env.MAINTENANCE_MODE === "true";
  const isExcluded = ["/maintenance","/favicon.svg"].includes(req.path) ||
    ["/webhook","/api","/admin","/subscription","/onboarding","/analytics"].some(p => req.path.startsWith(p));
  if (isMaintenance && !isExcluded) return res.sendFile(path.join(__dirname, "maintenance.html"));
  next();
};

app.use(maintenanceMode);
app.use(express.static(__dirname));
app.get("/maintenance", (req, res) => res.sendFile(path.join(__dirname, "maintenance.html")));

app.use("/webhook", webhookRouter);
app.use("/onboarding", onboardingRouter);
app.use("/api", requireApiKey, apiRouter);
app.use("/subscription", requireApiKey, subscriptionsRouter);
app.use("/analytics", requireApiKey, analyticsRouter);

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/signup", (req, res) => res.sendFile(path.join(__dirname, "signup.html")));
app.get("/privacy", (req, res) => res.sendFile(path.join(__dirname, "privacy.html")));
app.get("/guide", (req, res) => res.sendFile(path.join(__dirname, "guide.html")));
app.get("/403", (req, res) => res.sendFile(path.join(__dirname, "403.html")));
app.get("/dashboard", (req, res) => res.sendFile(path.join(__dirname, "dashboard.html")));
app.get("/admin", requireAdminToken, (req, res) => res.sendFile(path.join(__dirname, "admin.html")));

app.use((err, req, res, next) => { res.status(500).json({ error: "Erreur interne" }); });

app.listen(PORT, () => {
  console.log(`🚀 Serveur sur http://localhost:${PORT}`);
  console.log(`📈 Analytics : /analytics/merchant/:id`);
});

module.exports = app;