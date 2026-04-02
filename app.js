require("dotenv").config();
const express = require("express");
const path = require("path");
const { connectDB } = require("./config/database");
const webhookRouter = require("./routes/webhook");
const apiRouter = require("./routes/api");
const subscriptionsRouter = require("./routes/subscriptions");
const onboardingRouter = require("./routes/onboarding");
const analyticsRouter = require("./routes/analytics");
const boutiqueRouter = require("./routes/boutique");
const { startCronJobs } = require("./modules/retention");
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  family: 4 // 🔥 FORCE IPv4
});
// Optimisations (avec fallback si fichier absent)
const safeRequire = (path) => { try { return require(path); } catch { return {}; } };

const _cache = safeRequire("./core/cache");
const _queue = safeRequire("./core/queue") || safeRequire("./core/messageQueue");
const _indexes = safeRequire("./migrations/addIndexes");
const _limiter = safeRequire("./core/rateLimiter");

const initRedis = typeof _cache.initRedis === 'function' ? _cache.initRedis : async () => {};
const initQueue = typeof _queue.initQueue === 'function' ? _queue.initQueue : async () => {};
const runIndexMigration = typeof _indexes.runIndexMigration === 'function' ? _indexes.runIndexMigration : async () => {};
const initRateLimiter = typeof _limiter.initRateLimiter === 'function' ? _limiter.initRateLimiter : async () => {};

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

    await runIndexMigration().catch(err => console.warn("⚠️ Index migration:", err.message));
    
    // Migration slugs pour anciens commerçants
    try {
      const { migrateSlugs } = require("./migrations/migrate_slugs");
      await migrateSlugs();
    } catch (err) {
      console.warn("⚠️ Slug migration:", err.message);
    }
  } catch (err) {
    console.error("⚠️ Erreur migration DB:", err.message);
  }

  await initRedis().catch(() => {});

  let sharedRedis = null;
  try {
    if (process.env.REDIS_URL) {
      const { createClient } = require("redis");
      sharedRedis = createClient({ url: process.env.REDIS_URL });
      await sharedRedis.connect();
    }
  } catch {}
  await initRateLimiter(sharedRedis).catch(() => {});
  await initQueue().catch(() => {});

  startCronJobs();
  
  // Restaure les sessions Baileys au démarrage
  try {
    const { restoreAllSessions } = require('./core/baileys');
    const { handleBaileysMessage } = require('./core/router');
    await restoreAllSessions(handleBaileysMessage);
  } catch (err) {
    console.warn('⚠️ Baileys sessions non restaurées:', err.message);
  }
});

app.use(express.static(__dirname + '/public', { dotfiles: 'deny' }));
// sw.js doit être à la racine, pas dans /public
app.get('/sw.js', (req, res) => res.sendFile(__dirname + '/sw.js'));
app.get('/manifest.json', (req, res) => res.sendFile(__dirname + '/manifest.json'));
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
  const isExcluded = ["/maintenance", "/favicon.svg"].includes(req.path) ||
    ["/webhook", "/api", "/admin", "/subscription", "/onboarding", "/analytics", "/boutique"].some(p => req.path.startsWith(p));
  if (isMaintenance && !isExcluded) return res.sendFile(path.join(__dirname, "maintenance.html"));
  next();
};

app.use(maintenanceMode);
app.use(express.static(__dirname));
app.get("/maintenance", (req, res) => res.sendFile(path.join(__dirname, "maintenance.html")));

app.use("/webhook", webhookRouter);
app.use("/onboarding", onboardingRouter);

// ─── Route publique annonces (pas de clé API requise) ─────────────────────────
app.get("/api/announcements/active", async (req, res) => {
  try {
    const { Announcement } = require("./models/index");
    const ann = await Announcement.findOne({
      where: { isActive: true, showBanner: true },
      order: [["createdAt", "DESC"]],
    });
    if (!ann) return res.json(null);
    res.json({ id: ann.id, title: ann.title, message: ann.message, type: ann.type });
  } catch { res.json(null); }
});

app.use("/api", requireApiKey, apiRouter);
app.use("/subscription", requireApiKey, subscriptionsRouter);
app.use("/analytics", requireApiKey, analyticsRouter);
app.use("/boutique", boutiqueRouter);

app.get("/merchant", (req, res) => res.sendFile(path.join(__dirname, "merchant.html")));
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
  console.log(`🛍️ Boutiques : /boutique/:slug`);
  console.log(`📈 Analytics : /analytics/merchant/:id`);
});

module.exports = app;