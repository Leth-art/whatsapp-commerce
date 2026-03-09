/**
 * add_indexes.js — Migration : ajout d'index pour performance multi-tenant
 * Tables : Messages, Orders, Customers, ConversationSessions
 * Champs : merchant_id, customer_phone, order_id, created_at
 *
 * Exécution : node migrations/add_indexes.js
 */

require("dotenv").config();
const { sequelize } = require("../config/database");

const addIndexes = async () => {
  console.log("🚀 Début migration — ajout des index...\n");

  const indexes = [
    // ── Orders ──────────────────────────────────────────────────────────────
    { table: "Orders", field: "merchantId",  name: "idx_orders_merchant_id" },
    { table: "Orders", field: "customerId",  name: "idx_orders_customer_id" },
    { table: "Orders", field: "status",      name: "idx_orders_status" },
    { table: "Orders", field: "createdAt",   name: "idx_orders_created_at" },
    { table: "Orders", field: "paymentStatus", name: "idx_orders_payment_status" },

    // ── Customers ────────────────────────────────────────────────────────────
    { table: "Customers", field: "merchantId",      name: "idx_customers_merchant_id" },
    { table: "Customers", field: "whatsappNumber",  name: "idx_customers_phone" },
    { table: "Customers", field: "lastInteraction", name: "idx_customers_last_interaction" },

    // ── ConversationSessions ─────────────────────────────────────────────────
    { table: "ConversationSessions", field: "merchantId", name: "idx_sessions_merchant_id" },
    { table: "ConversationSessions", field: "customerId", name: "idx_sessions_customer_id" },
    { table: "ConversationSessions", field: "isActive",   name: "idx_sessions_is_active" },
    { table: "ConversationSessions", field: "createdAt",  name: "idx_sessions_created_at" },

    // ── Products ─────────────────────────────────────────────────────────────
    { table: "Products", field: "merchantId",  name: "idx_products_merchant_id" },
    { table: "Products", field: "isAvailable", name: "idx_products_available" },
    { table: "Products", field: "category",    name: "idx_products_category" },

    // ── Merchants ────────────────────────────────────────────────────────────
    { table: "Merchants", field: "isActive",             name: "idx_merchants_active" },
    { table: "Merchants", field: "plan",                 name: "idx_merchants_plan" },
    { table: "Merchants", field: "subscriptionExpiresAt", name: "idx_merchants_expires_at" },
  ];

  let success = 0;
  let skipped = 0;
  let errors = 0;

  for (const idx of indexes) {
    try {
      await sequelize.query(`
        CREATE INDEX IF NOT EXISTS "${idx.name}"
        ON "${idx.table}" ("${idx.field}")
      `);
      console.log(`  ✅ ${idx.table}.${idx.field} — ${idx.name}`);
      success++;
    } catch (err) {
      if (err.message.includes("already exists")) {
        console.log(`  ⏭️  ${idx.name} — déjà existant`);
        skipped++;
      } else {
        console.error(`  ❌ ${idx.name} — ${err.message}`);
        errors++;
      }
    }
  }

  // ── Index composites pour les requêtes les plus fréquentes ─────────────────
  const compositeIndexes = [
    {
      name: "idx_orders_merchant_status",
      table: "Orders",
      fields: '"merchantId", "status"',
    },
    {
      name: "idx_orders_merchant_created",
      table: "Orders",
      fields: '"merchantId", "createdAt" DESC',
    },
    {
      name: "idx_customers_merchant_phone",
      table: "Customers",
      fields: '"merchantId", "whatsappNumber"',
    },
    {
      name: "idx_sessions_merchant_active",
      table: "ConversationSessions",
      fields: '"merchantId", "isActive"',
    },
  ];

  console.log("\n📊 Index composites :");
  for (const idx of compositeIndexes) {
    try {
      await sequelize.query(`
        CREATE INDEX IF NOT EXISTS "${idx.name}"
        ON "${idx.table}" (${idx.fields})
      `);
      console.log(`  ✅ ${idx.name}`);
      success++;
    } catch (err) {
      if (err.message.includes("already exists")) {
        console.log(`  ⏭️  ${idx.name} — déjà existant`);
        skipped++;
      } else {
        console.error(`  ❌ ${idx.name} — ${err.message}`);
        errors++;
      }
    }
  }

  console.log(`\n✅ Migration terminée — ${success} créés, ${skipped} existants, ${errors} erreurs`);
  await sequelize.close();
};

addIndexes().catch((err) => {
  console.error("❌ Erreur migration :", err);
  process.exit(1);
});
