const { Product } = require("../models/index");

const getAllProducts = async (merchantId, availableOnly) => {
  if (availableOnly === undefined) availableOnly = true;
  const where = { merchantId };
  if (availableOnly) { where.isAvailable = true; }
  const products = await Product.findAll({ where });
  return availableOnly ? products.filter(p => p.stock > 0) : products;
};

const deductStock = async (productId, quantity) => {
  const product = await Product.findByPk(productId);
  if (!product || product.stock < quantity) return false;
  product.stock -= quantity;
  if (product.stock === 0) product.isAvailable = false;
  await product.save();
  return true;
};

const formatCatalogForAI = async (merchantId, currency) => {
  currency = currency || "FCFA";
  const products = await getAllProducts(merchantId);
  if (!products.length) return "Aucun produit disponible pour le moment.";
  const categories = {};
  for (const p of products) {
    const cat = p.category || "Divers";
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(p);
  }
  const lines = ["CATALOGUE DISPONIBLE :\n"];
  for (const cat of Object.keys(categories)) {
    lines.push(cat.toUpperCase());
    for (const p of categories[cat]) {
      const stockAlert = p.stock <= 5 ? " (Stock faible: " + p.stock + ")" : "";
      lines.push("  - " + p.name + " - " + p.price.toLocaleString("fr-FR") + " " + currency + stockAlert);
      if (p.description) lines.push("    " + p.description);
    }
    lines.push("");
  }
  return lines.join("\n");
};

module.exports = { getAllProducts, deductStock, formatCatalogForAI };
