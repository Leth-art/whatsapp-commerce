const express = require("express");
const router = express.Router();
const { Merchant, Product } = require("../models/index");
const { applyTemplate, listTemplates } = require("../modules/templates");
const { v4: uuidv4 } = require("uuid");

/**
 * GET /onboarding/templates
 * Liste tous les types de commerce disponibles
 */
router.get("/templates", (req, res) => {
  res.json(listTemplates());
});

/**
 * POST /onboarding/create
 * Crée une boutique avec le bon template automatiquement appliqué
 * Body: { name, email, city, phoneNumberId, whatsappToken, type, products[] }
 */
router.post("/create", async (req, res) => {
  try {
    const {
      name,
      email,
      city,
      phoneNumberId,
      whatsappToken,
      type,        // ex: "mode", "food", "tech"...
      currency,
      products,    // [{ name, price, stock, category, description }]
    } = req.body;

    if (!name || !phoneNumberId || !whatsappToken) {
      return res.status(400).json({ error: "Nom, phoneNumberId et whatsappToken obligatoires." });
    }

    // Appliquer le template selon le type de commerce
    const templateConfig = applyTemplate(type || "general", name, city);

    // Créer le commerçant
    const merchant = await Merchant.create({
      id: uuidv4(),
      name,
      email: email || "",
      city: city || "Lomé",
      currency: currency || "FCFA",
      phoneNumberId,
      whatsappToken,
      isActive: true,
      plan: "starter",
      // Abonnement test 7 jours gratuits
      subscriptionExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      ...templateConfig,
    });

    // Ajouter les produits si fournis
    let productsCreated = 0;
    if (products && products.length > 0) {
      for (const p of products) {
        await Product.create({
          id: uuidv4(),
          merchantId: merchant.id,
          name: p.name,
          price: parseFloat(p.price) || 0,
          stock: parseInt(p.stock) || 10,
          category: p.category || "Produits",
          description: p.description || "",
          isAvailable: true,
        });
        productsCreated++;
      }
    }

    res.status(201).json({
      success: true,
      merchantId: merchant.id,
      name: merchant.name,
      type: type || "general",
      productsCreated,
      trialEndsAt: merchant.subscriptionExpiresAt,
      message: `✅ Boutique "${name}" créée avec ${productsCreated} produits. Essai gratuit de 7 jours activé !`,
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
