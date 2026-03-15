/**
 * migrate_slugs.js — Génère des slugs pour les anciens commerçants
 * Lance une seule fois : node migrate_slugs.js
 * Appelé automatiquement au démarrage si des marchands sans slug existent
 */

const { Merchant } = require("./models/index");
const { Op } = require("sequelize");
const { v4: uuidv4 } = require("uuid");

const generateSlug = (name) => {
  return name
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40) || "boutique";
};

const migrateSlugs = async () => {
  const merchants = await Merchant.findAll({
    where: {
      [Op.or]: [
        { shopSlug: null },
        { shopSlug: "" },
      ]
    }
  });

  if (!merchants.length) {
    console.log("✅ Tous les commerçants ont déjà un slug");
    return 0;
  }

  console.log(`🔄 Migration slugs pour ${merchants.length} commerçant(s)...`);

  for (const merchant of merchants) {
    const name = merchant.shopName || merchant.name || "boutique";
    const slug = generateSlug(name) + "-" + uuidv4().slice(0, 6);
    await merchant.update({
      shopSlug: slug,
      siteTheme: merchant.siteTheme || "orange",
      siteActive: true,
    });
    console.log(`  ✅ ${merchant.name} → /boutique/${slug}`);
  }

  console.log(`✅ Migration terminée : ${merchants.length} slug(s) générés`);
  return merchants.length;
};

// Auto-run si appelé directement
if (require.main === module) {
  const { connectDB } = require("./config/database");
  connectDB()
    .then(() => migrateSlugs())
    .then(() => process.exit(0))
    .catch(err => { console.error(err); process.exit(1); });
}

module.exports = { migrateSlugs };
