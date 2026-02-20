const { Sequelize } = require("sequelize");
const path = require("path");

let sequelize;

if (process.env.DATABASE_URL) {
  // ─── PostgreSQL (Render / Production) ───
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: "postgres",
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    },
    logging: false,
  });
  console.log("🐘 Mode PostgreSQL (production)");
} else {
  // ─── SQLite (développement local) ───
  sequelize = new Sequelize({
    dialect: "sqlite",
    storage: path.join(__dirname, "../database.sqlite"),
    logging: false,
  });
  console.log("🗄️ Mode SQLite (local)");
}

const connectDB = async () => {
  try {
    await sequelize.authenticate();
    await sequelize.sync({ force: false });
    console.log("✅ Base de données connectée et tables créées");
  } catch (err) {
    console.error("❌ Erreur base de données :", err.message);
    process.exit(1);
  }
};

module.exports = { sequelize, connectDB };