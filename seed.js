require("dotenv").config();
const { connectDB } = require("./config/database");
const { Merchant, Product } = require("./models/index");
const { v4: uuidv4 } = require("uuid");

const seed = async () => {
  await connectDB();
  const existing = await Merchant.findOne({ where: { name: "Boutique Ama - Demo" } });
  if (existing) { console.log("Commerçant démo déjà existant. ID : " + existing.id); process.exit(0); }

  const merchant = await Merchant.create({
    id: uuidv4(),
    name: "Boutique Ama - Demo",
    email: "ama@boutique.tg",
    phoneNumberId: "VOTRE_PHONE_NUMBER_ID",
    whatsappToken: "VOTRE_WHATSAPP_TOKEN",
    businessDescription: "Boutique de mode à Lomé. Vêtements, chaussures et bijoux. Livraison 24h.",
    aiPersona: "Tu t'appelles Ama. Tu es chaleureuse et connais tous les produits par coeur.",
    city: "Lomé", country: "Togo", currency: "FCFA", plan: "pro",
    subscriptionExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });

  const products = [
    { name: "Robe Wax Élégante", category: "Vêtements", description: "Tissu wax africain. Tailles S-XL.", price: 15000, stock: 25 },
    { name: "Boubou Homme Premium", category: "Vêtements", description: "Brodé, pour cérémonies.", price: 22000, stock: 15 },
    { name: "T-shirt Coton Bio", category: "Vêtements", description: "100% coton bio, couleurs variées.", price: 5000, stock: 50 },
    { name: "Sandales Cuir Artisanales", category: "Chaussures", description: "Faites main, du 36 au 45.", price: 12000, stock: 20 },
    { name: "Baskets Sport", category: "Chaussures", description: "Légères et respirantes.", price: 18000, stock: 12 },
    { name: "Collier Perles Africaines", category: "Bijoux", description: "Artisanal, fait main.", price: 3500, stock: 40 },
    { name: "Bracelet Tissé", category: "Bijoux", description: "Motifs traditionnels togolais.", price: 1500, stock: 100 },
    { name: "Sac à Main Wax", category: "Accessoires", description: "Fermeture éclair, poignée cuir.", price: 9000, stock: 18 },
  ];

  for (const p of products) {
    await Product.create({ id: uuidv4(), merchantId: merchant.id, isAvailable: true, ...p });
  }

  console.log("✅ Commerçant créé : " + merchant.name);
  console.log("✅ " + products.length + " produits ajoutés");
  console.log("\n🎯 ID Commerçant : " + merchant.id);
  process.exit(0);
};

seed().catch(err => { console.error("Erreur seed :", err); process.exit(1); });
