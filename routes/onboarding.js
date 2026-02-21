const express = require("express");
const router = express.Router();
const { Merchant, Product } = require("../models/index");
const { applyTemplate, listTemplates } = require("../modules/templates");
const { v4: uuidv4 } = require("uuid");

router.get("/templates", (req, res) => {
  res.json(listTemplates());
});

router.post("/create", async (req, res) => {
  try {
    const { name, email, city, phoneNumberId, whatsappToken, type, currency, products } = req.body;

    if (!name || !phoneNumberId || !whatsappToken) {
      return res.status(400).json({ error: "Nom, phoneNumberId et whatsappToken obligatoires." });
    }

    const templateConfig = applyTemplate(type || "general", name, city);

    // Chercher un commerçant existant avec ce phoneNumberId
    let merchant = await Merchant.findOne({ where: { phoneNumberId } });

    if (merchant) {
      // Mettre à jour le commerçant existant
      await merchant.update({
        name,
        email: email || "",
        city: city || "Lomé",
        currency: currency || "FCFA",
        whatsappToken,
        isActive: true,
        subscriptionExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        ...templateConfig,
      });
    } else {
      // Créer un nouveau commerçant
      merchant = await Merchant.create({
        id: uuidv4(),
        name,
        email: email || "",
        city: city || "Lomé",
        currency: currency || "FCFA",
        phoneNumberId,
        whatsappToken,
        isActive: true,
        plan: "starter",
        subscriptionExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        ...templateConfig,
      });
    }

    // Ajouter les produits
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
      message: `Boutique "${name}" créée avec ${productsCreated} produits. Essai gratuit de 7 jours activé !`,
    });

  } catch (err) {
    console.error("Erreur onboarding :", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;