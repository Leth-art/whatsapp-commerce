const Product = require("../models/Product");

/**
 * Retourne tous les produits disponibles d'un commerçant.
 */
const getAllProducts = async (merchantId, availableOnly = true) => {
  const filter = { merchantId };
  if (availableOnly) {
    filter.isAvailable = true;
    filter.stock = { $gt: 0 };
  }
  return Product.find(filter);
};

/**
 * Recherche un produit par nom ou description.
 */
const searchProducts = async (merchantId, query) => {
  return Product.find({
    merchantId,
    isAvailable: true,
    $or: [
      { name: { $regex: query, $options: "i" } },
      { description: { $regex: query, $options: "i" } },
    ],
  });
};

/**
 * Déduit le stock après une vente.
 */
const deductStock = async (productId, quantity) => {
  const product = await Product.findById(productId);
  if (!product || product.stock < quantity) return false;
  product.stock -= quantity;
  if (product.stock === 0) product.isAvailable = false;
  await product.save();
  return true;
};

/**
 * Formate le catalogue en texte WhatsApp pour le contexte de l'IA.
 * L'IA utilise ce texte pour répondre aux questions sur les produits.
 */
const formatCatalogForAI = async (merchantId, currency = "FCFA") => {
  const products = await getAllProducts(merchantId);
  if (!products.length) return "Aucun produit disponible pour le moment.";

  // Grouper par catégorie
  const categories = {};
  for (const p of products) {
    const cat = p.category || "Divers";
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(p);
  }

  const lines = ["📦 *CATALOGUE DISPONIBLE :*\n"];
  for (const [cat, items] of Object.entries(categories)) {
    lines.push(`*${cat.toUpperCase()}*`);
    for (const p of items) {
      const stockAlert = p.stock <= 5 ? ` ⚠️ Plus que ${p.stock} en stock !` : "";
      lines.push(
        `  • *${p.name}* — ${p.price.toLocaleString("fr-FR")} ${currency}${stockAlert}`,
        `    ${p.description || ""}`
      );
    }
    lines.push("");
  }

  return lines.join("\n");
};

module.exports = {
  getAllProducts,
  searchProducts,
  deductStock,
  formatCatalogForAI,
};