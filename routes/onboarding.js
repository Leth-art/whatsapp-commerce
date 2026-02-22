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
    const { name, email, city, type, currency, products, ownerPhone } = req.body;

    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
    const whatsappToken = process.env.WHATSAPP_TOKEN || '';

    if (!name) {
      return res.status(400).json({ error: "Nom obligatoire." });
    }

    const templateConfig = applyTemplate(type || "general", name, city);

    // Chaque commerçant est unique par son numéro personnel OU son email
    // Plus jamais par phoneNumberId qui est le même pour tout le monde
    let merchant = null;

    if (ownerPhone) {
      merchant = await Merchant.findOne({ where: { ownerPhone } });
    } else if (email) {
      merchant = await Merchant.findOne({ where: { email } });
    }

    if (merchant) {
      // Mise à jour boutique existante
      await merchant.update({
        name, email: email || merchant.email,
        city: city || "Lomé", currency: currency || "FCFA",
        whatsappToken, phoneNumberId, isActive: true,
        ownerPhone: ownerPhone || merchant.ownerPhone,
        subscriptionExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        ...templateConfig,
      });
    } else {
      // Création nouvelle boutique avec ID unique
      merchant = await Merchant.create({
        id: uuidv4(),
        name, email: email || "",
        city: city || "Lomé", currency: currency || "FCFA",
        phoneNumberId, whatsappToken,
        ownerPhone: ownerPhone || "",
        isActive: true, plan: "starter",
        subscriptionExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        ...templateConfig,
      });
    }

    // Créer les produits
    let productsCreated = 0;
    if (products && products.length > 0) {
      for (const p of products) {
        await Product.create({
          id: uuidv4(), merchantId: merchant.id,
          name: p.name, price: parseFloat(p.price) || 0,
          stock: parseInt(p.stock) || 10,
          category: p.category || "Produits",
          description: p.description || "", isAvailable: true,
        });
        productsCreated++;
      }
    }

    res.status(201).json({
      success: true, merchantId: merchant.id, name: merchant.name,
      type: type || "general", productsCreated,
      trialEndsAt: merchant.subscriptionExpiresAt,
      message: `Boutique "${name}" créée avec ${productsCreated} produits. Essai gratuit de 7 jours activé !`,
    });

  } catch (err) {
    console.error("Erreur onboarding :", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;