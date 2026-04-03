const express = require("express");
const router = express.Router();
const { Merchant, Product } = require("../models/index");
const { applyTemplate, listTemplates } = require("../modules/templates");
const { v4: uuidv4 } = require("uuid");

// Génère un slug unique depuis le nom de la boutique
const generateSlug = (name) => {
  return name
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // remove accents
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40);
};

router.get("/templates", (req, res) => {
  res.json(listTemplates());
});

router.post("/create", async (req, res) => {
  try {
    const { name, email, city, type, currency, products, ownerPhone, plan } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Nom obligatoire." });
    }

    // Vérifier double inscription par téléphone OU email
    let existing = null;
    if (ownerPhone) {
      existing = await Merchant.findOne({ where: { ownerPhone } });
    }
    if (!existing && email) {
      existing = await Merchant.findOne({ where: { email } });
    }

    // Bloquer — même numéro ne peut pas faire 2 essais
    if (existing) {
      return res.status(409).json({
        error: "already_exists",
        message: "Un compte existe déjà avec ce numéro ou cet email.",
        merchantId: existing.id,
        dashboardUrl: `${process.env.APP_BASE_URL || ''}/dashboard?id=${existing.id}`
      });
    }

    const templateConfig = applyTemplate(type || "general", name, city);

    // Créer la nouvelle boutique
    const merchant = await Merchant.create({
      id: uuidv4(),
      name,
      email: email || "",
      city: city || "",
      country: "",
      currency: currency || "XOF",
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
      whatsappToken: process.env.WHATSAPP_TOKEN || "",
      ownerPhone: ownerPhone || "",
      shopSlug: generateSlug(name) + "-" + uuidv4().slice(0, 6),
      siteTheme: ({
        mode:"mode",food:"food",beaute:"beaute",tech:"tech",
        epicerie:"epicerie",artisanat:"artisanat",sante:"sante",
        bijoux:"bijoux",sport:"sport",maison:"maison",bebe:"bebe",
        education:"education",services:"services"
      })[type] || "orange",
      siteActive: true,
      isActive: true,
      plan: (["starter","pro","business"].includes(plan) ? plan : "starter"),
      subscriptionExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      ...templateConfig,
    });

    // Créer les produits
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
      siteUrl: `${process.env.APP_BASE_URL || process.env.APP_BASE_URL || ""}/boutique/${merchant.shopSlug}`,
      message: `Boutique "${name}" créée avec ${productsCreated} produits. Essai gratuit de 7 jours activé !`,
    });

  } catch (err) {
    console.error("Erreur onboarding :", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;