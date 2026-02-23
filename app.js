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

    // Migration SQLite — supprime la contrainte UNIQUE sur phoneNumberId
    // SQLite ne supporte pas ALTER TABLE DROP CONSTRAINT, on recrée la table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS "Merchants_new" (
        "id" VARCHAR(255) PRIMARY KEY,
        "name" VARCHAR(255) NOT NULL,
        "ownerPhone" VARCHAR(255) DEFAULT '',
        "email" VARCHAR(255),
        "phoneNumberId" VARCHAR(255) DEFAULT '',
        "whatsappToken" TEXT DEFAULT '',
        "businessDescription" TEXT DEFAULT '',
        "aiPersona" TEXT DEFAULT 'Tu es l assistante de cette boutique.',
        "welcomeMessage" TEXT DEFAULT 'Bonjour ! Comment puis-je vous aider ?',
        "city" VARCHAR(255) DEFAULT '',
        "country" VARCHAR(255) DEFAULT '',
        "currency" VARCHAR(255) DEFAULT 'XOF',
        "isActive" BOOLEAN DEFAULT 1,
        "plan" VARCHAR(255) DEFAULT 'starter',
        "subscriptionExpiresAt" DATETIME,
        "lastPaymentId" VARCHAR(255),
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Copier les données existantes
    await sequelize.query(`
      INSERT OR IGNORE INTO "Merchants_new"
      SELECT "id","name","ownerPhone","email","phoneNumberId","whatsappToken",
             "businessDescription","aiPersona","welcomeMessage","city","country",
             "currency","isActive","plan","subscriptionExpiresAt","lastPaymentId",
             "createdAt","updatedAt"
      FROM "Merchants"
    `).catch(() => {}); // ignore si Merchants n'existe pas encore
    // Remplacer l'ancienne table
    await sequelize.query(`DROP TABLE IF EXISTS "Merchants"`);
    await sequelize.query(`ALTER TABLE "Merchants_new" RENAME TO "Merchants"`);

    // Sync normal pour les autres tables
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