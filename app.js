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

connectDB().then(async () => {
  try {
    const { sequelize } = require("./config/database");

    // Migration PostgreSQL — supprime la contrainte UNIQUE sur phoneNumberId
    // On cherche et supprime toutes les contraintes unique sur phoneNumberId
    const constraints = await sequelize.query(`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'Merchants' 
      AND constraint_type = 'UNIQUE'
      AND constraint_name LIKE '%phoneNumberId%'
    `, { type: sequelize.QueryTypes.SELECT });

    for (const row of constraints) {
      await sequelize.query(`ALTER TABLE "Merchants" DROP CONSTRAINT IF EXISTS "${row.constraint_name}"`);
      console.log("✅ Contrainte supprimée :", row.constraint_name);
    }

    // Aussi essayer le nom exact trouvé dans les logs
    await sequelize.query(`ALTER TABLE "Merchants" DROP CONSTRAINT IF EXISTS "Merchants_phoneNumberId_key35"`).catch(() => {});
    await sequelize.query(`ALTER TABLE "Merchants" ALTER COLUMN "phoneNumberId" DROP NOT NULL`).catch(() => {});
    await sequelize.query(`ALTER TABLE "Merchants" ALTER COLUMN "whatsappToken" DROP NOT NULL`).catch(() => {});

    await sequelize.sync({ alter: true });
    console.log("✅ Base de données migrée et synchronisée");
  } catch (err) {
    console.error("⚠️ Erreur migration DB :", err.message);
  }
  startCronJobs();
});

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

// ── Mode Maintenance ──
const maintenanceMode = (req, res, next) => {
  const isMaintenance = process.env.MAINTENANCE_MODE === 'true';
  const isExcluded = 
    req.path === '/maintenance' ||
    req.path === '/favicon.svg' ||
    req.path.startsWith('/webhook') ||
    req.path.startsWith('/api') ||
    req.path.startsWith('/admin') ||
    req.path.startsWith('/subscription') ||
    req.path.startsWith('/onboarding');
  if (isMaintenance && !isExcluded) {
    return res.sendFile(path.join(__dirname, 'maintenance.html'));
  }
  next();
};
app.use(maintenanceMode);
app.get('/maintenance', (req, res) => { res.sendFile(path.join(__dirname, 'maintenance.html')); });

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