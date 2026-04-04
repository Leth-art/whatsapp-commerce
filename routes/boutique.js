/**
 * boutique.js — Mini-sites Shopify-style pour les commerçants WaziBot
 */

const express = require("express");
const router = express.Router();
const { Merchant, Product } = require("../models/index");

// Thèmes par secteur d'activité


router.get("/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    const merchant = await Merchant.findOne({ where: { shopSlug: slug, siteActive: true, isActive: true } });
    if (!merchant) return res.status(404).send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Boutique introuvable</title>
      <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:sans-serif;background:#f6f6f7;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center}.box{background:white;border-radius:12px;padding:48px 40px;box-shadow:0 1px 8px rgba(0,0,0,.1)}h2{font-size:20px;margin-bottom:8px}p{color:#6d7175;font-size:14px}a{display:inline-block;margin-top:20px;background:#e85c0e;color:white;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:600}</style></head>
      <body><div class="box"><div style="font-size:40px;margin-bottom:16px">🔍</div><h2>Boutique introuvable</h2><p>Ce lien n'est pas valide ou la boutique est suspendue.</p><a href="/">Créer votre boutique →</a></div></body></html>`);
    const products = await Product.findAll({ where: { merchantId: merchant.id, isAvailable: true }, order: [["createdAt","DESC"]] });
    const theme = THEMES[merchant.siteTheme] || THEMES.orange;
    const whatsappNumber = merchant.ownerPhone?.replace(/\D/g,"") || "";
    res.send(generateSiteHTML({ merchant, products, theme, whatsappNumber }));
  } catch (err) { console.error("Erreur boutique:", err.message); res.status(500).send("Erreur serveur"); }
});

router.patch("/:slug/theme", async (req, res) => {
  try {
    const { slug } = req.params;
    const { theme, merchantId } = req.body;
    if (!THEMES[theme]) return res.status(400).json({ error: "Thème invalide" });
    const merchant = await Merchant.findOne({ where: { shopSlug: slug, id: merchantId } });
    if (!merchant) return res.status(404).json({ error: "Boutique introuvable" });
    await merchant.update({ siteTheme: theme });
    res.json({ success: true, theme, siteUrl: `/boutique/${slug}` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/:slug/order", async (req, res) => {
  try {
    const { slug } = req.params;
    const { customerName, customerPhone, address, items, paymentMethod } = req.body;
    if (!customerName || !customerPhone || !address || !items || !items.length)
      return res.status(400).json({ error: "Informations manquantes" });
    const merchant = await Merchant.findOne({ where: { shopSlug: slug } });
    if (!merchant) return res.status(404).json({ error: "Boutique introuvable" });
    if (!merchant.isActive) return res.status(403).json({ error: "Cette boutique est suspendue." });
    const { Customer, Order } = require("../models/index");
    const { v4: uuidv4 } = require("uuid");
    let customer = await Customer.findOne({ where: { merchantId: merchant.id, whatsappNumber: customerPhone } });
    if (!customer) customer = await Customer.create({ id: uuidv4(), merchantId: merchant.id, whatsappNumber: customerPhone, name: customerName });
    else if (customerName && !customer.name) await customer.update({ name: customerName });
    const products = await Product.findAll({ where: { merchantId: merchant.id } });
    let totalAmount = 0;
    const orderItems = [];
    for (const item of items) {
      const product = products.find(p => p.id === item.productId);
      if (!product) continue;
      const qty = parseInt(item.quantity) || 1;
      const subtotal = product.price * qty;
      totalAmount += subtotal;
      orderItems.push({ productId: product.id, name: product.name, price: product.price, quantity: qty, total: subtotal });
    }
    if (!orderItems.length) return res.status(400).json({ error: "Aucun produit valide" });
    const orderNumber = "WB-" + Date.now().toString().slice(-6);
    await Order.create({ id: uuidv4(), orderNumber, merchantId: merchant.id, customerId: customer.id, items: orderItems, totalAmount, deliveryAddress: address, paymentMethod: paymentMethod || "mobile_money", status: "pending" });
    try {
      const { sendText } = require("../core/whatsappClient");
      const PID = process.env.WHATSAPP_PHONE_NUMBER_ID, TOK = process.env.WHATSAPP_TOKEN;
      if (PID && TOK && merchant.ownerPhone) {
        const il = orderItems.map(i=>`• ${i.name} x${i.quantity} — ${i.total.toLocaleString("fr-FR")} ${merchant.currency}`).join("\n");
        await sendText(PID, TOK, merchant.ownerPhone, `🔔 *Nouvelle commande — ${merchant.shopName||merchant.name}*\n\nN° *${orderNumber}*\n${il}\n\n💰 *${totalAmount.toLocaleString("fr-FR")} ${merchant.currency}*\n📍 ${address}\n📱 ${customerName} (${customerPhone})\n\n👉 ${process.env.APP_BASE_URL||"https://chatbot-saas-lcsl.onrender.com"}/merchant`).catch(()=>{});
      }
    } catch {}
    res.json({ success: true, orderNumber, totalAmount, message: `Commande ${orderNumber} reçue !` });
  } catch (err) { console.error("Erreur commande:", err.message); res.status(500).json({ error: "Erreur lors de la commande" }); }
});

router.post("/:slug/chat", async (req, res) => {
  try {
    const { slug } = req.params;
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "Message requis" });
    const merchant = await Merchant.findOne({ where: { shopSlug: slug } });
    if (!merchant) return res.status(404).json({ error: "Boutique introuvable" });

    // Vérifier la limite de messages du plan
    const { canSendMessage } = require("../modules/planLimits");
    const msgCheck = await canSendMessage(merchant);
    if (!msgCheck.allowed) {
      return res.json({ reply: "Je suis temporairement indisponible. Contactez-nous directement sur WhatsApp !" });
    }

    const products = await Product.findAll({ where: { merchantId: merchant.id, isAvailable: true } });
    res.json({ reply: generateBotReply(message, merchant, products) });
  } catch { res.status(500).json({ reply: "Désolé, problème technique. Contactez-nous sur WhatsApp !" }); }
});

// ─── POST /boutique/:slug/notify-cart ─────────────────────────────────────────
// Notification WhatsApp au commerçant quand un client ajoute au panier
router.post("/:slug/notify-cart", async (req, res) => {
  try {
    const { slug } = req.params;
    const { productName, productPrice, currency } = req.body;
    if (!productName) return res.status(400).json({ ok: false });

    const merchant = await Merchant.findOne({ where: { shopSlug: slug } });
    if (!merchant || !merchant.isActive) return res.json({ ok: false });

    // Envoyer notif WhatsApp seulement si le commerçant a un numéro configuré
    try {
      const { sendText } = require("../core/whatsappClient");
      const PID = process.env.WHATSAPP_PHONE_NUMBER_ID;
      const TOK = process.env.WHATSAPP_TOKEN;
      if (PID && TOK && merchant.ownerPhone) {
        const price = Number(productPrice).toLocaleString("fr-FR");
        await sendText(PID, TOK, merchant.ownerPhone,
          `🛒 *Activité boutique — ${merchant.shopName || merchant.name}*\n\n` +
          `Un client vient d'ajouter *${productName}* (${price} ${currency || merchant.currency || "XOF"}) à son panier.\n\n` +
          `👉 Restez disponible pour finaliser la commande !`
        ).catch(() => {});
      }
    } catch {}

    res.json({ ok: true });
  } catch { res.json({ ok: false }); }
});


const generateBotReply = (message, merchant, products) => {
  const msg = message.toLowerCase().trim();
  const n = merchant.shopName || merchant.name;
  const c = merchant.currency || "XOF";
  const ph = merchant.ownerPhone || "";
  if (/^(bonjour|bonsoir|salut|hello|hi|yo|bjr|bsr|slt)/.test(msg)) return `Bonjour ! 👋 Bienvenue chez *${n}*.\n\nJe peux vous aider :\n• 📦 Catalogue\n• 💰 Prix\n• 🚚 Livraison\n• 📞 Contact`;
  if (/prix|combien|tarif|catalogue|produit|article|vend/.test(msg)) {
    if (!products.length) return "Catalogue en préparation. Contactez-nous !";
    const list = products.slice(0,8).map(p=>`• *${p.name}* — ${Number(p.price).toLocaleString("fr-FR")} ${c}`).join("\n");
    return `🛍️ *Nos produits :*\n\n${list}${products.length>8?`\n...et ${products.length-8} autres.`:""}\n\nCliquez sur un produit pour l'ajouter !`;
  }
  const found = products.filter(p=>p.name.toLowerCase().includes(msg)||(p.category||"").toLowerCase().includes(msg)||(p.description||"").toLowerCase().includes(msg));
  if (found.length) { const p=found[0]; return `*${p.name}*\n\n💰 *${Number(p.price).toLocaleString("fr-FR")} ${c}*\n${p.description?"\n"+p.description:""}\n\nCliquez "Ajouter au panier" !`; }
  if (/livr|délai|expédit|deliver/.test(msg)) return `📦 *Livraison*\n\nNous livrons${merchant.city?` à *${merchant.city}*`:""} et dans les environs.${ph?"\n\n📱 +"+ph:""}`;
  if (/paiement|payer|mobile money|mtn|moov|wave|orange/.test(msg)) return `💳 *Paiement*\n\n• 📱 Mobile Money (MTN, Moov, Wave, Orange)\n• 💵 À la livraison`;
  if (/contact|téléphone|numéro|whatsapp/.test(msg)) return ph?`📞 *Contact*\n\nWhatsApp : *+${ph}*\nLun-Sam, 8h-20h.`:"Contactez-nous via le bouton WhatsApp !";
  if (/heure|ouvert|horaire/.test(msg)) return `🕐 *Horaires*\n\nLun — Ven : 8h — 18h\nSam : 9h — 15h`;
  if (/commander|acheter|order/.test(msg)) return `🛒 *Commander*\n\n1. Ajoutez au panier\n2. Validez le panier\n3. Remplissez vos infos\n\nSimple et rapide ! 😊`;
  if (/merci|thank|parfait|super|ok/.test(msg)) return `De rien ! 😊 N'hésitez pas.`;
  return `Je peux vous aider :\n\n• 📦 *catalogue*\n• 🚚 *livraison*\n• 💳 *paiement*\n• 📞 *contact*\n\nOu tapez le nom d'un produit !`;
};

// ─── Thèmes visuels par secteur ───────────────────────────────────────────────
// ─── Thèmes visuels par secteur ─────────────────────────────────────────────
const THEMES = {

  // 👗 MODE — Rose élégant, Playfair Display
  mode: {
    primary:"#BE185D", dark:"#9D174D", light:"#FCE7F3",
    bg:"#fff", surface:"#fdf2f8", text:"#1a1a1a", muted:"#6b7280",
    label:"👗 Mode & Vêtements",
    heroImg:"https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1200&q=85&fit=crop",
    heroOverlay:"rgba(0,0,0,0)", font:"'Playfair Display',serif", bodyFont:"'DM Sans',sans-serif",
    tagline:"Découvrez les dernières tendances mode", badge:"Mode & Vêtements", emoji:"👗",
    feat:["✂️ Tailles disponibles","🚚 Livraison rapide","↩️ Échanges faciles"],
  },

  // 🍽️ FOOD — Orange brûlé, Abril Fatface
  food: {
    primary:"#D97706", dark:"#B45309", light:"#FEF3C7",
    bg:"#fffdf7", surface:"#fef9ee", text:"#1c1507", muted:"#78716c",
    label:"🍽️ Alimentation & Restauration",
    heroImg:"https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&q=85&fit=crop",
    heroOverlay:"rgba(0,0,0,0)", font:"'Abril Fatface',cursive", bodyFont:"'Nunito',sans-serif",
    tagline:"Des saveurs authentiques livrées chez vous", badge:"Alimentation", emoji:"🍽️",
    feat:["🌿 Produits frais du jour","⚡ Livraison express","🏠 Commande à domicile"],
  },

  // 💄 BEAUTÉ — Violet luxe, Cormorant Garamond
  beaute: {
    primary:"#7C3AED", dark:"#6D28D9", light:"#EDE9FE",
    bg:"#fdfcff", surface:"#f5f3ff", text:"#1a1a2e", muted:"#6b7280",
    label:"💄 Beauté & Cosmétiques",
    heroImg:"https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=1200&q=85&fit=crop",
    heroOverlay:"rgba(0,0,0,0)", font:"'Cormorant Garamond',serif", bodyFont:"'Jost',sans-serif",
    tagline:"Sublimez votre beauté naturelle", badge:"Beauté & Cosmétiques", emoji:"💄",
    feat:["🌸 Produits naturels","✨ Conseils beauté","🎁 Coffrets cadeaux"],
  },

  // 📱 TECH — Bleu moderne, Space Grotesk
  tech: {
    primary:"#2563EB", dark:"#1D4ED8", light:"#DBEAFE",
    bg:"#f8faff", surface:"#eff6ff", text:"#0f172a", muted:"#64748b",
    label:"📱 High-Tech & Électronique",
    heroImg:"https://images.unsplash.com/photo-1593640408182-31c228d54d3c?w=1200&q=85&fit=crop",
    heroOverlay:"rgba(0,0,0,0)", font:"'Space Grotesk',sans-serif", bodyFont:"'Inter',sans-serif",
    tagline:"La technologie à portée de main", badge:"High-Tech", emoji:"📱",
    feat:["🔧 Garantie incluse","📦 Livraison sécurisée","🛡️ Produits certifiés"],
  },

  // 🛒 ÉPICERIE — Vert forêt, Poppins
  epicerie: {
    primary:"#15803D", dark:"#166534", light:"#DCFCE7",
    bg:"#f9fff9", surface:"#f0fdf4", text:"#14532d", muted:"#6b7280",
    label:"🛒 Épicerie & Supermarché",
    heroImg:"https://images.unsplash.com/photo-1579113800032-c38bd7635818?w=1200&q=85&fit=crop",
    heroOverlay:"rgba(0,0,0,0)", font:"'Poppins',sans-serif", bodyFont:"'Poppins',sans-serif",
    tagline:"Votre épicerie du quartier en ligne", badge:"Épicerie", emoji:"🛒",
    feat:["🥦 Produits frais","🚚 Livraison quotidienne","💰 Prix imbattables"],
  },

  // 🏺 ARTISANAT — Marron terre, Libre Baskerville
  artisanat: {
    primary:"#92400E", dark:"#78350F", light:"#FEF3C7",
    bg:"#fffdf7", surface:"#fefce8", text:"#1c1507", muted:"#78716c",
    label:"🏺 Artisanat & Décoration",
    heroImg:"https://images.unsplash.com/photo-1489659639091-8b687bc4386e?w=1200&q=85&fit=crop",
    heroOverlay:"rgba(0,0,0,0)", font:"'Libre Baskerville',serif", bodyFont:"'Source Sans Pro',sans-serif",
    tagline:"L'art et le savoir-faire africain", badge:"Artisanat & Déco", emoji:"🏺",
    feat:["🤝 Fait main","🌍 Artisans locaux","🎁 Pièces uniques"],
  },

  // 💊 SANTÉ — Teal médical, Nunito
  sante: {
    primary:"#0D9488", dark:"#0F766E", light:"#CCFBF1",
    bg:"#f9fffd", surface:"#f0fdfa", text:"#0f3d38", muted:"#6b7280",
    label:"💊 Santé & Pharmacie",
    heroImg:"https://images.unsplash.com/photo-1631549916768-4119b2e5f926?w=1200&q=85&fit=crop",
    heroOverlay:"rgba(0,0,0,0)", font:"'Nunito',sans-serif", bodyFont:"'Nunito',sans-serif",
    tagline:"Votre santé, notre priorité", badge:"Santé & Pharmacie", emoji:"💊",
    feat:["✅ Produits certifiés","🚚 Livraison urgente","👨‍⚕️ Conseils santé"],
  },

  // 💍 BIJOUX — Or prestige, Cormorant Garamond
  bijoux: {
    primary:"#B45309", dark:"#92400E", light:"#FEF9C3",
    bg:"#fffef5", surface:"#fefce8", text:"#1c1507", muted:"#78716c",
    label:"💍 Bijoux & Accessoires",
    heroImg:"https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=1200&q=85&fit=crop",
    heroOverlay:"rgba(0,0,0,0)", font:"'Cormorant Garamond',serif", bodyFont:"'Lato',sans-serif",
    tagline:"Des bijoux d'exception pour chaque occasion", badge:"Bijoux & Accessoires", emoji:"💍",
    feat:["💎 Or & argent","📦 Coffret cadeau","🔐 Authenticité garantie"],
  },

  // ⚽ SPORT — Bleu dynamique, Barlow Condensed
  sport: {
    primary:"#1E40AF", dark:"#1E3A8A", light:"#DBEAFE",
    bg:"#f8faff", surface:"#eff6ff", text:"#0f172a", muted:"#64748b",
    label:"⚽ Sport & Fitness",
    heroImg:"https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=1200&q=85&fit=crop",
    heroOverlay:"rgba(0,0,0,0)", font:"'Barlow Condensed',sans-serif", bodyFont:"'Barlow',sans-serif",
    tagline:"Équipez-vous pour la performance", badge:"Sport & Fitness", emoji:"⚽",
    feat:["🏆 Équipement pro","🚚 Livraison rapide","🔄 Échanges faciles"],
  },

  // 🏠 MAISON — Vert olive, Raleway
  maison: {
    primary:"#4D7C0F", dark:"#3F6212", light:"#ECFCCB",
    bg:"#fafff5", surface:"#f7ffe8", text:"#1a2e05", muted:"#6b7280",
    label:"🏠 Maison & Mobilier",
    heroImg:"https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=1200&q=85&fit=crop",
    heroOverlay:"rgba(0,0,0,0)", font:"'Raleway',sans-serif", bodyFont:"'Raleway',sans-serif",
    tagline:"Créez l'intérieur de vos rêves", badge:"Maison & Mobilier", emoji:"🏠",
    feat:["🏡 Livraison à domicile","🔨 Installation possible","✨ Design exclusif"],
  },

  // 👶 BÉBÉ — Rose doux, Nunito
  bebe: {
    primary:"#DB2777", dark:"#BE185D", light:"#FCE7F3",
    bg:"#fff9fc", surface:"#fdf2f8", text:"#1a1a1a", muted:"#9ca3af",
    label:"👶 Bébé & Enfants",
    heroImg:"https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=1200&q=85&fit=crop",
    heroOverlay:"rgba(0,0,0,0)", font:"'Nunito',sans-serif", bodyFont:"'Nunito',sans-serif",
    tagline:"Tout pour le bonheur de vos enfants", badge:"Bébé & Enfants", emoji:"👶",
    feat:["🌸 Produits doux & sûrs","🚚 Livraison soignée","✅ Certifiés enfants"],
  },

  // 🎓 ÉDUCATION — Bleu académique, IBM Plex Sans
  education: {
    primary:"#1D4ED8", dark:"#1E40AF", light:"#DBEAFE",
    bg:"#f8faff", surface:"#eff6ff", text:"#0f172a", muted:"#64748b",
    label:"🎓 Éducation & Formation",
    heroImg:"https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=1200&q=85&fit=crop",
    heroOverlay:"rgba(0,0,0,0)", font:"'IBM Plex Sans',sans-serif", bodyFont:"'IBM Plex Sans',sans-serif",
    tagline:"Investissez dans l'avenir de vos apprenants", badge:"Éducation", emoji:"🎓",
    feat:["📚 Ressources complètes","🎯 Suivi personnalisé","🏆 Certifications"],
  },

  // 🔧 SERVICES — Gris pro, IBM Plex Sans
  services: {
    primary:"#374151", dark:"#1F2937", light:"#F3F4F6",
    bg:"#f9fafb", surface:"#f3f4f6", text:"#111827", muted:"#6b7280",
    label:"🔧 Services & Professionnels",
    heroImg:"https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=1200&q=85&fit=crop",
    heroOverlay:"rgba(0,0,0,0)", font:"'IBM Plex Sans',sans-serif", bodyFont:"'IBM Plex Sans',sans-serif",
    tagline:"Des services professionnels de qualité", badge:"Services", emoji:"🔧",
    feat:["⭐ Pros certifiés","📞 Support disponible","✅ Satisfaction garantie"],
  },

  // 🏪 GÉNÉRAL — Orange WaziBot
  orange: {
    primary:"#E85C0E", dark:"#C44D0B", light:"#FEF0E8",
    bg:"#fff", surface:"#f9f9f9", text:"#1a1a1a", muted:"#6b7280",
    label:"🏪 Boutique Générale",
    heroImg:"https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200&q=85&fit=crop",
    heroOverlay:"rgba(0,0,0,0)", font:"'Plus Jakarta Sans',sans-serif", bodyFont:"'Plus Jakarta Sans',sans-serif",
    tagline:"Tout ce dont vous avez besoin", badge:"Boutique", emoji:"🛍️",
    feat:["🚚 Livraison disponible","📱 Paiement Mobile Money","✅ Qualité garantie"],
  },
};


const generateSiteHTML = ({ merchant, products, theme, whatsappNumber }) => {
  const shopName = merchant.shopName || merchant.name;
  const description = (merchant.businessDescription && merchant.businessDescription.trim().length > 10)
    ? merchant.businessDescription
    : theme.tagline;
  const city = merchant.city || "";
  const currency = merchant.currency || "XOF";
  const cats = [...new Set(products.map(p => p.category || "Divers"))];
  const slug = merchant.shopSlug;
  const mid = merchant.id;
  const currentTheme = merchant.siteTheme || "orange";

  // Google Fonts per theme
  const fontMap = {
    "Playfair Display": "family=Playfair+Display:wght@400;700;800",
    "Abril Fatface": "family=Abril+Fatface",
    "Cormorant Garamond": "family=Cormorant+Garamond:wght@400;600;700",
    "Space Grotesk": "family=Space+Grotesk:wght@400;500;600;700",
    "Poppins": "family=Poppins:wght@400;500;600;700;800",
    "Libre Baskerville": "family=Libre+Baskerville:wght@400;700",
    "Nunito": "family=Nunito:wght@400;600;700;800",
    "Barlow Condensed": "family=Barlow+Condensed:wght@400;600;700;800",
    "Barlow": "family=Barlow:wght@400;500;600",
    "Raleway": "family=Raleway:wght@400;500;600;700;800",
    "IBM Plex Sans": "family=IBM+Plex+Sans:wght@400;500;600;700",
    "DM Sans": "family=DM+Sans:wght@400;500;600;700",
    "Jost": "family=Jost:wght@400;500;600;700",
    "Source Sans Pro": "family=Source+Sans+Pro:wght@400;600;700",
    "Lato": "family=Lato:wght@400;700",
    "Inter": "family=Inter:wght@400;500;600;700",
  };
  const heroFont = (theme.font || "'Plus Jakarta Sans',sans-serif").replace(/'/g,'').split(',')[0].trim();
  const bodyFont = (theme.bodyFont || "'Plus Jakarta Sans',sans-serif").replace(/'/g,'').split(',')[0].trim();
  const fontFamilies = [...new Set([heroFont, bodyFont, "Plus Jakarta Sans"])].map(f => fontMap[f] || "family=Plus+Jakarta+Sans:wght@400;500;600;700;800").join("&");
  const googleFontsUrl = "https://fonts.googleapis.com/css2?" + fontFamilies + "&display=swap";

  // Feature items
  const feats = theme.feat || ["🚚 Livraison disponible","📱 Mobile Money","✅ Qualité garantie"];

  // Products HTML
  let productsHTML = "";
  if (!products.length) {
    productsHTML = '<div class="empty-state"><div style="font-size:48px;margin-bottom:12px">' + theme.emoji + '</div><p>Catalogue en cours de préparation...</p></div>';
  } else {
    products.forEach(function(p) {
      const safeName = (p.name||"").replace(/"/g,'&quot;').replace(/'/g,'&#39;');
      const safeDesc = ((p.description||"").slice(0,120)).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
      const safeCat  = (p.category||"").replace(/"/g,'&quot;').replace(/'/g,'&#39;');
      const safeImg  = (p.imageUrl||"").replace(/"/g,'&quot;');
      const price    = Number(p.price);
      const cat      = p.category||"Divers";
      const mediaContent = p.imageUrl
        ? '<img src="'+safeImg+'" alt="'+safeName+'" loading="lazy">'
        : '<div class="product-placeholder">'+(p.name||" ").charAt(0).toUpperCase()+'</div>';
      const descHTML = p.description
        ? '<p class="product-desc">'+(p.description.slice(0,70))+(p.description.length>70?"…":"")+'</p>' : "";
      productsHTML +=
        '<div class="product-card" data-cat="'+cat+'">'+
        '<div class="product-media" onclick="openQV(this)"'+
        ' data-id="'+p.id+'"'+
        ' data-name="'+safeName+'"'+
        ' data-price="'+price+'"'+
        ' data-img="'+safeImg+'"'+
        ' data-desc="'+safeDesc+'"'+
        ' data-cat="'+safeCat+'">'+
        mediaContent+
        '<div class="quick-view-hint">Aperçu rapide</div>'+
        '</div>'+
        '<div class="product-info">'+
        '<div class="product-vendor">'+cat+'</div>'+
        '<h3 class="product-title">'+(p.name||"")+'</h3>'+
        descHTML+
        '<div class="product-bottom">'+
        '<div class="product-price">'+price.toLocaleString("fr-FR")+'<span class="price-unit"> '+currency+'</span></div>'+
        '<button class="btn-add" onclick="event.stopPropagation();addCartFromCard(this)"'+
        ' data-id="'+p.id+'"'+
        ' data-name="'+safeName+'"'+
        ' data-price="'+price+'"'+
        ' data-img="'+safeImg+'">'+
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'+
        'Ajouter</button>'+
        '</div></div></div>';
    });
  }

  // Categories
  let catsHTML = "";
  if (cats.length > 1) {
    catsHTML = '<div class="filter-tabs"><button class="ftab active" onclick="filterCat(\'all\',this)">Tout</button>';
    cats.forEach(function(c) { catsHTML += '<button class="ftab" onclick="filterCat(\''+c.replace(/'/g,"\\'")+ '\',this)">'+c+'</button>'; });
    catsHTML += '</div>';
  }

  // Theme dots
  const themeList = [
    {key:"mode",color:"#BE185D"},{key:"food",color:"#C2410C"},{key:"beaute",color:"#7C3AED"},
    {key:"tech",color:"#1D4ED8"},{key:"epicerie",color:"#15803D"},{key:"artisanat",color:"#92400E"},
    {key:"sante",color:"#0D9488"},{key:"bijoux",color:"#B45309"},{key:"sport",color:"#1E40AF"},
    {key:"maison",color:"#4D7C0F"},{key:"bebe",color:"#DB2777"},{key:"services",color:"#374151"},
    {key:"orange",color:"#EA580C"},
  ];
  let dotsHTML = "";
  themeList.forEach(function(t) {
    const active = currentTheme===t.key ? " active" : "";
    const th = THEMES[t.key];
    dotsHTML += '<div class="tdot'+active+'" style="background:'+t.color+'" onclick="changeTheme(\''+t.key+'\')" title="'+(th?th.label:t.key)+'"></div>';
  });

  // Logo
  const words = shopName.split(" ");
  const logoHTML = '<span>'+words[0]+'</span>'+(words.length>1?" "+words.slice(1).join(" "):"");
  const waLink = whatsappNumber
    ? '<a href="https://wa.me/'+whatsappNumber+'" target="_blank" style="display:inline-flex;align-items:center;gap:6px;margin-top:12px;background:#25D366;color:white;padding:8px 16px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600">💬 WhatsApp</a>' : "";

  const p  = theme.primary;
  const pd = theme.dark;
  const pl = theme.light;
  const bg = theme.bg;
  const sf = theme.surface;
  const tx = theme.text;
  const mt = theme.muted;
  const hf = theme.font || "'Plus Jakarta Sans',sans-serif";
  const bf = theme.bodyFont || "'Plus Jakarta Sans',sans-serif";

  let html = "";
  html += "<!DOCTYPE html>\n<html lang='fr'>\n<head>\n";
  html += "<meta charset='UTF-8'><meta name='viewport' content='width=device-width, initial-scale=1.0'>\n";
  html += "<title>"+shopName+"</title>\n";
  html += "<meta name='description' content='"+description.replace(/'/g,"&#39;")+"'>\n";
  html += "<link href='"+googleFontsUrl+"' rel='stylesheet'>\n";
  html += "<style>\n";
  html += ":root{--p:"+p+";--pd:"+pd+";--pl:"+pl+";--bg:"+bg+";--sf:"+sf+";--tx:"+tx+";--mt:"+mt+";--bd:#e1e3e5;--r:8px;}\n";
  html += "*{margin:0;padding:0;box-sizing:border-box}html{scroll-behavior:smooth}\n";
  html += "body{font-family:"+bf+";background:var(--bg);color:var(--tx);-webkit-font-smoothing:antialiased}\n";
  // Ann banner
  html += ".ann-banner{position:fixed;top:0;left:0;right:0;z-index:9999;padding:9px 16px;display:none;align-items:center;gap:10px;font-size:13px;font-weight:600}\n";
  html += ".ann-banner.show{display:flex}.ann-txt{flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}\n";
  html += ".ann-txt.scroll{animation:scrollTxt 20s linear infinite;display:inline-block}\n";
  html += "@keyframes scrollTxt{0%{transform:translateX(80%)}100%{transform:translateX(-100%)}}\n";
  html += ".ann-x{background:none;border:none;cursor:pointer;font-size:18px;opacity:.7;color:inherit}\n";
  // Header
  html += ".hdr{background:white;border-bottom:1px solid var(--bd);position:sticky;top:0;z-index:100;box-shadow:0 1px 4px rgba(0,0,0,.06)}\n";
  html += ".hdr-in{max-width:1280px;margin:0 auto;padding:0 24px;height:64px;display:flex;align-items:center;justify-content:space-between;gap:16px}\n";
  html += ".logo{font-size:21px;font-weight:800;color:var(--tx);text-decoration:none;letter-spacing:-.4px;font-family:"+hf+"}.logo span{color:var(--p)}\n";
  html += ".hdr-loc{font-size:11px;color:var(--mt);margin-top:2px}\n";
  html += ".hdr-actions{display:flex;align-items:center;gap:8px}\n";
  html += ".btn-wa{background:var(--p);color:white;border:none;padding:9px 18px;border-radius:var(--r);font-size:13px;font-weight:600;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:6px;transition:.15s;font-family:inherit}\n";
  html += ".btn-wa:hover{background:var(--pd)}\n";
  html += ".cart-icon-btn{position:relative;background:var(--sf);border:1px solid var(--bd);width:40px;height:40px;border-radius:var(--r);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:.15s;color:var(--tx)}\n";
  html += ".cart-icon-btn:hover{border-color:var(--p);color:var(--p)}\n";
  html += ".cart-pill{position:absolute;top:-7px;right:-7px;background:var(--p);color:white;width:18px;height:18px;border-radius:50%;font-size:10px;font-weight:700;display:none;align-items:center;justify-content:center;border:2px solid white}.cart-pill.show{display:flex}\n";
  // HERO — with image background
  html += ".hero{position:relative;min-height:480px;display:flex;align-items:center;overflow:hidden}\n";
  html += ".hero-bg{position:absolute;inset:0;background-image:url('"+theme.heroImg+"');background-size:cover;background-position:center;filter:brightness(1)}\n";
  html += ".hero-overlay{display:none}\n";
  html += ".hero-in{position:relative;z-index:1;max-width:1280px;margin:0 auto;padding:60px 24px;width:100%}\n";
  html += ".hero-badge{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.2);backdrop-filter:blur(8px);color:white;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:6px 16px;border-radius:20px;margin-bottom:20px;border:1px solid rgba(255,255,255,.3)}\n";
  html += ".hero h1{font-family:"+hf+";font-size:clamp(32px,5vw,60px);font-weight:800;line-height:1.1;color:white;margin-bottom:14px;letter-spacing:-.5px;text-shadow:0 2px 16px rgba(0,0,0,.8),0 4px 32px rgba(0,0,0,.6);max-width:600px}\n";
  html += ".hero h1 em{font-style:normal;color:white;text-decoration:underline;text-decoration-color:"+p+";text-decoration-thickness:3px;text-underline-offset:6px}\n";
  html += ".hero p{color:rgba(255,255,255,.95);font-size:17px;line-height:1.7;margin-bottom:32px;max-width:480px;text-shadow:0 2px 12px rgba(0,0,0,.9)}\n";
html += ".hero-feats{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px;margin-bottom:24px}\n";
  html += ".hero-feat{background:rgba(255,255,255,.18);backdrop-filter:blur(8px);color:white;font-size:12px;font-weight:600;padding:5px 14px;border-radius:20px;border:1px solid rgba(255,255,255,.25)}\n";
  html += ".hero-cta{display:flex;gap:12px;flex-wrap:wrap}\n";
  html += ".btn-hp{background:white;color:var(--p);border:none;padding:14px 28px;border-radius:var(--r);font-size:15px;font-weight:700;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:8px;transition:.15s;font-family:inherit;box-shadow:0 4px 16px rgba(0,0,0,.15)}\n";
  html += ".btn-hp:hover{transform:translateY(-2px);box-shadow:0 6px 24px rgba(0,0,0,.2)}\n";
  html += ".btn-hs{background:rgba(255,255,255,.15);backdrop-filter:blur(8px);color:white;border:1.5px solid rgba(255,255,255,.5);padding:13px 24px;border-radius:var(--r);font-size:15px;font-weight:600;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:8px;transition:.15s;font-family:inherit}\n";
  html += ".btn-hs:hover{background:rgba(255,255,255,.25)}\n";
  html += ".hero-stats{display:flex;gap:32px;margin-top:40px;flex-wrap:wrap}\n";
  html += ".hstat{background:rgba(255,255,255,.15);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.2);border-radius:12px;padding:14px 20px;text-align:center}\n";
  html += ".hstat-n{font-family:"+hf+";font-size:24px;font-weight:800;color:white}\n";
  html += ".hstat-l{font-size:11px;color:rgba(255,255,255,.8);text-transform:uppercase;letter-spacing:.8px;margin-top:3px}\n";
  // Features
  html += ".feat-band{background:white;border-bottom:1px solid var(--bd)}\n";
  html += ".feat-in{max-width:1280px;margin:0 auto;display:grid;grid-template-columns:repeat(3,1fr)}\n";
  html += ".feat-item{display:flex;align-items:center;gap:12px;padding:20px 24px;border-right:1px solid var(--bd)}.feat-item:last-child{border-right:none}\n";
  html += ".feat-icon{font-size:22px;flex-shrink:0}\n";
  html += ".feat-ttl{font-size:13px;font-weight:700}.feat-sub{font-size:12px;color:var(--mt);margin-top:1px}\n";
  // Catalogue
  html += ".cat-section{max-width:1280px;margin:0 auto;padding:48px 24px}\n";
  html += ".cat-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;gap:16px;flex-wrap:wrap}\n";
  html += ".cat-ttl{font-family:"+hf+";font-size:22px;font-weight:800;letter-spacing:-.3px}.cat-cnt{font-size:13px;color:var(--mt);margin-top:3px}\n";
  html += ".filter-tabs{display:flex;gap:6px;flex-wrap:wrap}\n";
  html += ".ftab{padding:7px 15px;border-radius:20px;font-size:12px;font-weight:600;border:1.5px solid var(--bd);background:transparent;color:var(--mt);cursor:pointer;transition:.15s;font-family:inherit}\n";
  html += ".ftab:hover,.ftab.active{background:var(--p);color:white;border-color:var(--p)}\n";
  html += ".pgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:20px}\n";
  html += ".product-card{background:white;border:1px solid var(--bd);border-radius:12px;overflow:hidden;transition:.2s;cursor:pointer}\n";
  html += ".product-card:hover{box-shadow:0 6px 28px rgba(0,0,0,.12);transform:translateY(-3px);border-color:rgba(0,0,0,.12)}\n";
  html += ".product-media{position:relative;padding-top:100%;overflow:hidden;background:var(--sf)}\n";
  html += ".product-media img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform .4s}\n";
  html += ".product-card:hover .product-media img{transform:scale(1.05)}\n";
  html += ".product-placeholder{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:48px;font-weight:800;color:#9ca3af;background:#f9fafb;letter-spacing:-1px}\n";
  html += ".quick-view-hint{position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,.65);color:white;font-size:11px;font-weight:600;text-align:center;padding:8px;opacity:0;transition:.2s}\n";
  html += ".product-card:hover .quick-view-hint{opacity:1}\n";
  html += ".product-info{padding:12px 14px 14px}\n";
  html += ".product-vendor{font-size:10px;color:var(--mt);text-transform:uppercase;letter-spacing:1px;margin-bottom:3px;font-weight:600}\n";
  html += ".product-title{font-size:14px;font-weight:700;margin-bottom:3px;line-height:1.3}\n";
  html += ".product-desc{font-size:11px;color:var(--mt);line-height:1.5;margin-bottom:8px}\n";
  html += ".product-bottom{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:8px}\n";
  html += ".product-price{font-size:16px;font-weight:800;color:var(--p)}.price-unit{font-size:10px;font-weight:500;color:var(--mt)}\n";
  html += ".btn-add{background:var(--p);color:white;border:none;padding:8px 12px;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:4px;transition:.15s;font-family:inherit;white-space:nowrap}\n";
  html += ".btn-add:hover{background:var(--pd)}.empty-state{text-align:center;padding:72px 24px;color:var(--mt)}\n";
  // Footer
  html += ".ftr{background:#1a1a1a;color:rgba(255,255,255,.7);padding:40px 24px 28px;margin-top:60px}\n";
  html += ".ftr-in{max-width:1280px;margin:0 auto}\n";
  html += ".ftr-top{display:flex;gap:40px;margin-bottom:32px;flex-wrap:wrap;justify-content:space-between}\n";
  html += ".ftr-brand h3{font-family:"+hf+";font-size:18px;font-weight:800;color:white;margin-bottom:6px}\n";
  html += ".ftr-brand p{font-size:13px;line-height:1.6;max-width:260px}\n";
  html += ".ftr-lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,.4);margin-bottom:10px}\n";
  html += ".ftr-links a{display:block;font-size:13px;color:rgba(255,255,255,.65);text-decoration:none;margin-bottom:7px}.ftr-links a:hover{color:white}\n";
  html += ".ftr-btm{border-top:1px solid rgba(255,255,255,.08);padding-top:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px}\n";
  html += ".ftr-btm p{font-size:12px;color:rgba(255,255,255,.35)}.ftr-btm a{color:var(--p);text-decoration:none;font-size:12px}\n";
  // Cart drawer
  html += ".cart-ov{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:500;opacity:0;pointer-events:none;transition:.25s}.cart-ov.open{opacity:1;pointer-events:all}\n";
  html += ".cart-drw{position:fixed;top:0;right:0;bottom:0;width:420px;background:white;z-index:501;transform:translateX(100%);transition:.3s cubic-bezier(.4,0,.2,1);display:flex;flex-direction:column;box-shadow:-8px 0 40px rgba(0,0,0,.12)}.cart-drw.open{transform:translateX(0)}\n";
  html += ".drw-hdr{padding:18px 22px;border-bottom:1px solid var(--bd);display:flex;align-items:center;justify-content:space-between}.drw-ttl{font-size:16px;font-weight:800}\n";
  html += ".drw-close{background:none;border:none;cursor:pointer;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--mt);transition:.15s}.drw-close:hover{background:var(--sf)}\n";
  html += ".drw-body{flex:1;overflow-y:auto;padding:18px 22px}.cart-es{text-align:center;padding:40px 0;color:var(--mt)}\n";
  html += ".ci{display:flex;gap:14px;padding:14px 0;border-bottom:1px solid var(--bd)}.ci:last-child{border-bottom:none}\n";
  html += ".ci-img{width:68px;height:68px;border-radius:8px;background:var(--sf);flex-shrink:0;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;color:var(--p)}\n";
  html += ".ci-img img{width:100%;height:100%;object-fit:cover}.ci-body{flex:1;min-width:0}\n";
  html += ".ci-name{font-size:13px;font-weight:600;margin-bottom:2px}.ci-price{font-size:13px;color:var(--p);font-weight:700}\n";
  html += ".ci-ctrl{display:flex;align-items:center;gap:8px;margin-top:8px}\n";
  html += ".qcb{width:26px;height:26px;border:1.5px solid var(--bd);background:transparent;border-radius:6px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:14px;transition:.15s}.qcb:hover{border-color:var(--p);color:var(--p)}\n";
  html += ".ci-rm{background:none;border:none;color:var(--mt);font-size:20px;cursor:pointer;margin-left:auto;line-height:1}.ci-rm:hover{color:#c0392b}\n";
  html += ".drw-ftr{padding:18px 22px;border-top:1px solid var(--bd);background:white}\n";
  html += ".drw-sub{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px}.drw-sub-lbl{font-size:13px;color:var(--mt)}.drw-sub-amt{font-size:20px;font-weight:800}\n";
  html += ".drw-note{font-size:11px;color:var(--mt);margin-bottom:14px}\n";
  html += ".btn-checkout{width:100%;background:var(--p);color:white;border:none;padding:14px;border-radius:var(--r);font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;transition:.15s;display:flex;align-items:center;justify-content:center;gap:7px}.btn-checkout:hover{background:var(--pd)}\n";
  html += ".btn-cont{width:100%;background:transparent;color:var(--mt);border:none;padding:10px;font-size:13px;cursor:pointer;font-family:inherit;margin-top:6px}\n";
  // QV
  html += ".qv-ov{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:550;display:none;align-items:center;justify-content:center;padding:20px}.qv-ov.open{display:flex}\n";
  html += ".qv-modal{background:white;border-radius:16px;width:100%;max-width:640px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.2)}\n";
  html += ".qv-inner{display:grid;grid-template-columns:1fr 1fr}.qv-media{background:var(--sf);position:relative;min-height:320px;display:flex;align-items:center;justify-content:center;overflow:hidden}\n";
  html += ".qv-media img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.qv-ph{font-size:72px;font-weight:800;color:var(--p)}\n";
  html += ".qv-info{padding:28px 22px;display:flex;flex-direction:column}.qv-vendor{font-size:10px;color:var(--mt);text-transform:uppercase;letter-spacing:1px;margin-bottom:5px;font-weight:700}\n";
  html += ".qv-ttl{font-family:"+hf+";font-size:19px;font-weight:800;margin-bottom:6px}.qv-price{font-size:22px;font-weight:800;color:var(--p);margin-bottom:10px}\n";
  html += ".qv-desc{font-size:13px;color:var(--mt);line-height:1.6;margin-bottom:18px;flex:1}.qv-btns{display:flex;flex-direction:column;gap:8px}\n";
  html += ".btn-qv{background:var(--p);color:white;border:none;padding:13px;border-radius:var(--r);font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;transition:.15s;display:flex;align-items:center;justify-content:center;gap:7px}.btn-qv:hover{background:var(--pd)}\n";
  html += ".btn-qvc{background:var(--sf);color:var(--tx);border:1px solid var(--bd);padding:11px;border-radius:var(--r);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit}\n";
  // Checkout
  html += ".co-ov{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:600;display:none;align-items:center;justify-content:center;padding:20px}.co-ov.open{display:flex}\n";
  html += ".co-modal{background:white;border-radius:16px;width:100%;max-width:480px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.2)}\n";
  html += ".co-hdr{padding:18px 22px;border-bottom:1px solid var(--bd);display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:white;z-index:1}\n";
  html += ".co-hdr h3{font-family:"+hf+";font-size:16px;font-weight:800}.co-x{background:none;border:none;cursor:pointer;font-size:20px;color:var(--mt)}\n";
  html += ".co-body{padding:22px}.co-stl{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--mt);margin-bottom:12px}\n";
  html += ".co-sum{background:var(--sf);border-radius:10px;padding:14px;margin-bottom:20px}\n";
  html += ".co-si{display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px;color:var(--mt)}\n";
  html += ".co-si.total{font-weight:800;font-size:15px;color:var(--p);border-top:1px solid var(--bd);padding-top:8px;margin-top:4px;margin-bottom:0}\n";
  html += ".co-fi{margin-bottom:12px}.co-fi label{display:block;font-size:11px;font-weight:600;color:var(--tx);margin-bottom:4px}\n";
  html += ".co-fi input,.co-fi select,.co-fi textarea{width:100%;border:1.5px solid var(--bd);border-radius:var(--r);padding:10px 13px;font-size:14px;font-family:inherit;color:var(--tx);background:white;outline:none;transition:.15s}\n";
  html += ".co-fi input:focus,.co-fi select:focus,.co-fi textarea:focus{border-color:var(--p)}.co-fi textarea{resize:none;min-height:72px}\n";
  html += ".btn-order{width:100%;background:var(--p);color:white;border:none;padding:14px;border-radius:var(--r);font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:7px}.btn-order:hover{background:var(--pd)}.btn-order:disabled{opacity:.6;cursor:not-allowed}\n";
  html += ".co-ok-box{text-align:center;padding:32px 20px}.co-ok{width:68px;height:68px;background:#d4edda;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:30px;margin:0 auto 14px}\n";
  html += ".co-ok-box h4{font-size:17px;font-weight:800;margin-bottom:6px}.co-ok-box p{color:var(--mt);font-size:13px;line-height:1.6}\n";
  html += ".co-num{background:var(--pl);color:var(--p);font-weight:700;padding:4px 12px;border-radius:20px;font-size:12px;display:inline-block;margin:6px 0}\n";
  // Chat
  html += ".chat-w{position:fixed;bottom:24px;right:24px;z-index:400}\n";
  html += ".chat-tog{width:56px;height:56px;border-radius:50%;border:none;background:var(--p);color:white;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,.25);transition:.2s;display:flex;align-items:center;justify-content:center;position:relative}\n";
  html += ".chat-tog:hover{transform:scale(1.08)}\n";
  html += ".chat-notif{position:absolute;top:-4px;right:-4px;width:18px;height:18px;background:#e74c3c;border-radius:50%;font-size:9px;font-weight:700;color:white;display:none;align-items:center;justify-content:center;border:2px solid white}\n";
  html += ".chat-box{position:absolute;bottom:68px;right:0;width:340px;background:white;border-radius:16px;overflow:hidden;display:none;box-shadow:0 8px 40px rgba(0,0,0,.15);border:1px solid var(--bd)}\n";
  html += ".chat-box.open{display:flex;flex-direction:column;animation:su .2s ease}\n";
  html += "@keyframes su{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}\n";
  html += ".chat-hdr{background:var(--p);padding:14px 16px;display:flex;align-items:center;justify-content:space-between}\n";
  html += ".ch-info{display:flex;align-items:center;gap:10px}.ch-av{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:16px}\n";
  html += ".ch-name{font-weight:700;font-size:13px;color:white}.ch-st{font-size:10px;color:rgba(255,255,255,.75);margin-top:1px}\n";
  html += ".ch-xbtn{background:none;border:none;color:rgba(255,255,255,.8);font-size:18px;cursor:pointer}\n";
  html += ".chat-msgs{padding:14px;height:260px;overflow-y:auto;display:flex;flex-direction:column;gap:8px}\n";
  html += ".chat-msgs::-webkit-scrollbar{width:3px}.chat-msgs::-webkit-scrollbar-thumb{background:var(--bd);border-radius:3px}\n";
  html += ".cm{max-width:86%;padding:9px 13px;border-radius:12px;font-size:13px;line-height:1.5}\n";
  html += ".cm.bot{background:var(--sf);color:var(--tx);border-radius:4px 12px 12px 12px;align-self:flex-start}\n";
  html += ".cm.user{background:var(--p);color:white;border-radius:12px 4px 12px 12px;align-self:flex-end}\n";
  html += ".typing-cm{display:flex;gap:4px;align-items:center;padding:10px 13px !important}\n";
  html += ".typing-cm span{width:6px;height:6px;background:var(--mt);border-radius:50%;animation:bn 1.2s infinite}\n";
  html += ".typing-cm span:nth-child(2){animation-delay:.2s}.typing-cm span:nth-child(3){animation-delay:.4s}\n";
  html += "@keyframes bn{0%,80%,100%{transform:scale(.8);opacity:.5}40%{transform:scale(1.2);opacity:1}}\n";
  html += ".chat-qks{padding:8px 10px;display:flex;gap:5px;flex-wrap:wrap;border-top:1px solid var(--bd)}\n";
  html += ".qk-btn{padding:4px 10px;border-radius:20px;border:1.5px solid var(--bd);background:transparent;color:var(--mt);font-size:11px;cursor:pointer;transition:.15s;font-family:inherit}.qk-btn:hover{border-color:var(--p);color:var(--p)}\n";
  html += ".chat-inp-w{padding:10px;border-top:1px solid var(--bd);display:flex;gap:8px}\n";
  html += ".ch-inp{flex:1;background:var(--sf);border:1.5px solid var(--bd);color:var(--tx);padding:8px 13px;border-radius:20px;font-size:13px;font-family:inherit;outline:none;transition:.15s}.ch-inp:focus{border-color:var(--p)}\n";
  html += ".ch-snd{width:34px;height:34px;border-radius:50%;background:var(--p);border:none;color:white;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0}.ch-snd:hover{background:var(--pd)}\n";
  // Theme switcher
  html += ".theme-sw{position:fixed;bottom:90px;left:22px;z-index:300}\n";
  html += ".theme-tog-btn{width:40px;height:40px;border-radius:50%;border:1.5px solid var(--bd);background:white;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(0,0,0,.1)}\n";
  html += ".theme-pan{position:absolute;bottom:50px;left:0;background:white;border:1px solid var(--bd);border-radius:14px;padding:14px;display:none;box-shadow:0 8px 32px rgba(0,0,0,.12);min-width:220px}\n";
  html += ".theme-pan.open{display:block}.theme-pan-lbl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:var(--mt);margin-bottom:10px}\n";
  html += ".tdots{display:flex;flex-wrap:wrap;gap:7px}\n";
  html += ".tdot{width:28px;height:28px;border-radius:50%;cursor:pointer;border:3px solid transparent;transition:.2s;position:relative}.tdot:hover,.tdot.active{border-color:#1a1a1a;transform:scale(1.15)}\n";
  html += ".theme-current-lbl{font-size:11px;color:var(--p);margin-top:10px;font-weight:600}\n";
  html += ".wa-float{display:none;position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:#25D366;color:white;text-decoration:none;padding:11px 22px;border-radius:30px;font-weight:700;font-size:13px;box-shadow:0 4px 14px rgba(37,211,102,.4);z-index:299;align-items:center;gap:7px;white-space:nowrap}\n";
  // Responsive
  html += "@media(max-width:900px){.feat-in{grid-template-columns:1fr}.feat-item{border-right:none;border-bottom:1px solid var(--bd);padding:14px 16px}.feat-item:last-child{border-bottom:none}.cart-drw{width:100%}.qv-inner{grid-template-columns:1fr}.qv-media{min-height:200px}.hero{min-height:380px}}\n";
  html += "@media(max-width:500px){.pgrid{grid-template-columns:repeat(2,1fr);gap:12px}.product-info{padding:9px 11px 11px}.hero h1{font-size:28px}.hero{min-height:340px}.cat-section{padding:32px 16px}.hdr-in{padding:0 16px}.chat-w{bottom:80px;right:14px}.chat-box{width:295px;right:-14px}.theme-sw{bottom:80px;left:14px}.wa-float{display:flex}.hero-stats{gap:12px}.hstat{padding:10px 14px}}\n";
  html += "</style></head><body>\n";

  // Banner
  html += "<div class='ann-banner' id='ann-banner'><span id='ann-ic'>ℹ️</span><span class='ann-txt' id='ann-txt'></span><button class='ann-x' onclick='closeBanner()'>✕</button></div>\n";

  // Header
  html += "<header class='hdr'><div class='hdr-in'><div>";
  html += "<a href='#' class='logo'>"+logoHTML+"</a>";
  if (city) html += "<div class='hdr-loc'>📍 "+city+"</div>";
  html += "</div><div class='hdr-actions'>";
  if (whatsappNumber) html += "<a href='https://wa.me/"+whatsappNumber+"' target='_blank' class='btn-wa'>💬 WhatsApp</a>";
  html += "<button class='cart-icon-btn' onclick='toggleCart()'><svg width='17' height='17' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8'><path d='M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z'/><line x1='3' y1='6' x2='21' y2='6'/><path d='M16 10a4 4 0 01-8 0'/></svg><div class='cart-pill' id='cart-pill'>0</div></button>";
  html += "</div></div></header>\n";

  // HERO with background image
  html += "<section class='hero'>";
  html += "<div class='hero-bg'></div>";
  html += "<div class='hero-overlay'></div>";
  html += "<div class='hero-in'>";
  html += "<div class='hero-badge'>"+theme.emoji+" "+theme.badge+"</div>";
  html += "<h1>"+logoHTML+"</h1>";
  html += "<p>"+description+"</p>";
  html += "<div class='hero-cta'><a href='#catalogue' class='btn-hp'>Découvrir nos produits</a>";
  if (whatsappNumber) html += "<a href='https://wa.me/"+whatsappNumber+"' target='_blank' class='btn-hs'>💬 Commander</a>";
  html += "</div>";
  // Feature pills per theme
  html += "<div class='hero-feats'>";
  feats.forEach(function(f){ html += "<span class='hero-feat'>" + f + "</span>"; });
  html += "</div>";
  html += "<div class='hero-stats'>";
  html += "<div class='hstat'><div class='hstat-n'>"+products.length+"</div><div class='hstat-l'>Produits</div></div>";
  html += "<div class='hstat'><div class='hstat-n'>24/7</div><div class='hstat-l'>Disponible</div></div>";
  html += "<div class='hstat'><div class='hstat-n'>⭐</div><div class='hstat-l'>Qualité</div></div>";
  html += "</div></div></section>\n";

  // Features band
  html += "<div class='feat-band'><div class='feat-in'>";
  feats.forEach(function(f) {
    const parts = f.split(" ");
    const icon = parts[0];
    const text = parts.slice(1).join(" ");
    html += "<div class='feat-item'><span class='feat-icon'>"+icon+"</span><div><div class='feat-ttl'>"+text+"</div><div class='feat-sub'>"+city+"</div></div></div>";
  });
  html += "</div></div>\n";

  // Catalogue
  html += "<section class='cat-section' id='catalogue'><div class='cat-hdr'><div>";
  html += "<h2 class='cat-ttl'>Notre catalogue</h2>";
  html += "<p class='cat-cnt'>"+products.length+" produit"+(products.length>1?"s":"")+"</p>";
  html += "</div>"+catsHTML+"</div>";
  html += "<div class='pgrid' id='products-grid'>"+productsHTML+"</div></section>\n";

  // Footer
  html += "<footer class='ftr'><div class='ftr-in'><div class='ftr-top'><div class='ftr-brand'>";
  html += "<h3>"+shopName+"</h3><p>"+description+"</p>"+waLink;
  html += "</div><div><div class='ftr-lbl'>Liens utiles</div><div class='ftr-links'>";
  html += "<a href='#catalogue'>Nos produits</a>";
  if (whatsappNumber) html += "<a href='https://wa.me/"+whatsappNumber+"' target='_blank'>Nous contacter</a>";
  html += "</div></div></div>";
  html += "<div class='ftr-btm'><p>© "+new Date().getFullYear()+" "+shopName+(city?" · "+city:"")+"</p>";
  html += "<a href='/merchant?id="+mid+"'>Espace commerçant</a></div></div></footer>\n";

  if (whatsappNumber) html += "<a href='https://wa.me/"+whatsappNumber+"' target='_blank' class='wa-float'>💬 Commander sur WhatsApp</a>\n";

  // Cart drawer
  html += "<div class='cart-ov' id='cart-ov' onclick='toggleCart()'></div>\n";
  html += "<div class='cart-drw' id='cart-drw'>";
  html += "<div class='drw-hdr'><div class='drw-ttl'>Mon panier (<span id='drw-cnt'>0</span>)</div><button class='drw-close' onclick='toggleCart()'>✕</button></div>";
  html += "<div class='drw-body' id='drw-body'><div class='cart-es'><div style='font-size:44px;margin-bottom:8px'>🛒</div><p style='font-size:14px;color:var(--mt);margin-bottom:16px'>Votre panier est vide</p><button onclick='toggleCart()' style='background:var(--p);color:white;border:none;padding:9px 20px;border-radius:8px;font-weight:700;cursor:pointer;font-family:inherit;font-size:13px'>Continuer</button></div></div>";
  html += "<div class='drw-ftr' id='drw-ftr' style='display:none'><div class='drw-sub'><span class='drw-sub-lbl'>Sous-total</span><span class='drw-sub-amt' id='drw-amt'>0</span></div><p class='drw-note'>Livraison calculée à la commande</p><button class='btn-checkout' onclick='openCheckout()'>Passer la commande →</button><button class='btn-cont' onclick='toggleCart()'>Continuer les achats</button></div></div>\n";

  // Quick view
  html += "<div class='qv-ov' id='qv-ov'><div class='qv-modal'><div class='qv-inner'>";
  html += "<div class='qv-media' id='qv-media'><div class='qv-ph' id='qv-ph'></div></div>";
  html += "<div class='qv-info'><div class='qv-vendor' id='qv-vnd'></div><h3 class='qv-ttl' id='qv-ttl'></h3><div class='qv-price' id='qv-px'></div><p class='qv-desc' id='qv-dsc'></p>";
  html += "<div class='qv-btns'><button class='btn-qv' id='qv-add-btn'>Ajouter au panier</button><button class='btn-qvc' onclick='closeQV()'>Fermer</button></div></div></div></div></div>\n";

  // Checkout
  html += "<div class='co-ov' id='co-ov'><div class='co-modal'><div class='co-hdr'><h3>Finaliser la commande</h3><button class='co-x' onclick='closeCO()'>✕</button></div><div class='co-body' id='co-body'></div></div></div>\n";

  // Theme switcher
  html += "<div class='theme-sw'><div class='theme-pan' id='tpan'>";
  html += "<div class='theme-pan-lbl'>🎨 Ambiance boutique</div>";
  html += "<div class='tdots'>"+dotsHTML+"</div>";
  html += "<div class='theme-current-lbl' id='theme-lbl'>"+((THEMES[currentTheme]||THEMES.orange).label)+"</div>";
  html += "</div><button class='theme-tog-btn' onclick=\"document.getElementById('tpan').classList.toggle('open')\">🎨</button></div>\n";

  // Bot
  const safeShopName = shopName.replace(/'/g,"&#39;").replace(/"/g,"&quot;");
  html += "<div class='chat-w'><div class='chat-box' id='chat-box'>";
  html += "<div class='chat-hdr'><div class='ch-info'><div class='ch-av'>"+theme.emoji+"</div>";
  html += "<div><div class='ch-name'>"+safeShopName+"</div><div class='ch-st'>● En ligne · Répond instantanément</div></div></div>";
  html += "<button class='ch-xbtn' onclick='toggleChat()'>✕</button></div>";
  html += "<div class='chat-msgs' id='chat-msgs'></div>";
  html += "<div class='chat-qks'>";
  html += "<button class='qk-btn' onclick=\"sendQuick('catalogue')\">🛍️ Catalogue</button>";
  html += "<button class='qk-btn' onclick=\"sendQuick('livraison')\">🚚 Livraison</button>";
  html += "<button class='qk-btn' onclick=\"sendQuick('paiement')\">💳 Paiement</button>";
  html += "<button class='qk-btn' onclick=\"sendQuick('contact')\">📞 Contact</button>";
  html += "</div>";
  html += "<div class='chat-inp-w'><input class='ch-inp' id='ch-inp' placeholder='Posez votre question...' onkeydown=\"if(event.key==='Enter')sendBotMsg()\"><button class='ch-snd' onclick='sendBotMsg()'><svg width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5'><line x1='22' y1='2' x2='11' y2='13'/><polygon points='22 2 15 22 11 13 2 9 22 2'/></svg></button></div>";
  html += "</div>";
  html += "<button class='chat-tog' onclick='toggleChat()'><span id='ch-icon'><svg width='22' height='22' viewBox='0 0 24 24' fill='currentColor'><path d='M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z'/></svg></span><div class='chat-notif' id='ch-notif'>1</div></button>";
  html += "</div>\n";

  // JavaScript
  html += "<script>\n";
  html += "var SLUG='"+slug+"';var MID='"+mid+"';var CUR='"+currency+"';\n";
  html += "var cart={};\n";
  html += "function addCartFromCard(b){var n=b.getAttribute('data-name'),p=parseFloat(b.getAttribute('data-price'));addToCart(b.getAttribute('data-id'),n,p,b.getAttribute('data-img'));fetch('/boutique/'+SLUG+'/notify-cart',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productName:n,productPrice:p,currency:CUR})}).catch(function(){});}\n";
  html += "function addToCart(id,name,price,img){if(cart[id])cart[id].qty++;else cart[id]={name:name,price:price,qty:1,img:img||''};updateCartUI();showAddedToast(name);if(!cOpen)openCart();}\n";
  html += "function updateCartUI(){\n";
  html += "  var tot=Object.values(cart).reduce(function(s,i){return s+i.qty;},0);\n";
  html += "  var amt=Object.values(cart).reduce(function(s,i){return s+i.price*i.qty;},0);\n";
  html += "  var pill=document.getElementById('cart-pill');pill.textContent=tot;pill.classList.toggle('show',tot>0);\n";
  html += "  document.getElementById('drw-cnt').textContent=tot;\n";
  html += "  document.getElementById('drw-amt').textContent=amt.toLocaleString('fr-FR')+' '+CUR;\n";
  html += "  var body=document.getElementById('drw-body'),ftr=document.getElementById('drw-ftr');\n";
  html += "  if(!tot){body.innerHTML='<div class=\"cart-es\"><div style=\"font-size:44px;margin-bottom:8px\">🛒</div><p style=\"font-size:14px;color:var(--mt);margin-bottom:16px\">Votre panier est vide</p><button onclick=\"toggleCart()\" style=\"background:var(--p);color:white;border:none;padding:9px 20px;border-radius:8px;font-weight:700;cursor:pointer;font-family:inherit;font-size:13px\">Continuer</button></div>';ftr.style.display='none';\n";
  html += "  }else{var h='';Object.entries(cart).forEach(function(e){var id=e[0],it=e[1];h+='<div class=\"ci\"><div class=\"ci-img\">'+(it.img?'<img src=\"'+it.img+'\" alt=\"\">':it.name.charAt(0))+'</div><div class=\"ci-body\"><div class=\"ci-name\">'+it.name+'</div><div class=\"ci-price\">'+(it.price*it.qty).toLocaleString('fr-FR')+' '+CUR+'</div><div class=\"ci-ctrl\"><button class=\"qcb\" onclick=\"cqty(\\''+id+'\\',-1)\">−</button><span style=\"min-width:18px;text-align:center;font-weight:700\">'+it.qty+'</span><button class=\"qcb\" onclick=\"cqty(\\''+id+'\\'  ,1)\">+</button><button class=\"ci-rm\" onclick=\"removeCI(\\''+id+'\\')\" >×</button></div></div></div>';});body.innerHTML=h;ftr.style.display='block';}\n";
  html += "}\n";
  html += "function cqty(id,d){if(!cart[id])return;cart[id].qty+=d;if(cart[id].qty<=0)delete cart[id];updateCartUI();}\n";
  html += "function removeCI(id){delete cart[id];updateCartUI();}\n";
  html += "var cOpen=false;\n";
  html += "function toggleCart(){cOpen=!cOpen;document.getElementById('cart-ov').classList.toggle('open',cOpen);document.getElementById('cart-drw').classList.toggle('open',cOpen);}\n";
  html += "function openCart(){cOpen=true;document.getElementById('cart-ov').classList.add('open');document.getElementById('cart-drw').classList.add('open');}\n";
  html += "function showAddedToast(n){var t=document.createElement('div');t.style.cssText='position:fixed;top:78px;right:20px;background:#1a1a1a;color:white;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:600;z-index:600;box-shadow:0 4px 12px rgba(0,0,0,.2)';t.textContent='✓ '+n+' ajouté';document.body.appendChild(t);setTimeout(function(){t.remove();},2200);}\n";
  html += "var qvC={};\n";
  html += "function openQV(el){var id=el.getAttribute('data-id'),name=el.getAttribute('data-name'),price=parseFloat(el.getAttribute('data-price')),img=el.getAttribute('data-img'),desc=el.getAttribute('data-desc'),cat=el.getAttribute('data-cat');qvC={id:id,name:name,price:price,img:img};\n";
  html += "  document.getElementById('qv-vnd').textContent=cat||'Produit';\n";
  html += "  document.getElementById('qv-ttl').textContent=name;\n";
  html += "  document.getElementById('qv-px').textContent=Number(price).toLocaleString('fr-FR')+' '+CUR;\n";
  html += "  document.getElementById('qv-dsc').textContent=desc||'';\n";
  html += "  var media=document.getElementById('qv-media'),ph=document.getElementById('qv-ph'),old=media.querySelector('img');if(old)old.remove();\n";
  html += "  if(img){ph.style.display='none';var im=document.createElement('img');im.src=img;im.alt=name;im.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:cover';media.appendChild(im);}else{ph.style.display='flex';ph.textContent=name.charAt(0).toUpperCase();}\n";
  html += "  document.getElementById('qv-add-btn').onclick=function(){addToCart(qvC.id,qvC.name,qvC.price,qvC.img);closeQV();};\n";
  html += "  document.getElementById('qv-ov').classList.add('open');\n";
  html += "}\n";
  html += "function closeQV(){document.getElementById('qv-ov').classList.remove('open');}\n";
  html += "function openCheckout(){var its=Object.entries(cart);if(!its.length)return;var tot=its.reduce(function(s,e){return s+e[1].price*e[1].qty;},0);var s='';its.forEach(function(e){s+='<div class=\"co-si\"><span>'+e[1].name+' × '+e[1].qty+'</span><span>'+(e[1].price*e[1].qty).toLocaleString('fr-FR')+' '+CUR+'</span></div>';});s+='<div class=\"co-si total\"><span>Total</span><span>'+tot.toLocaleString('fr-FR')+' '+CUR+'</span></div>';\n";
  html += "  var b=document.getElementById('co-body');b.innerHTML='<div class=\"co-sum\">'+s+'</div>';\n";
  html += "  b.innerHTML+='<p class=\"co-stl\">Vos coordonnées</p>';\n";
  html += "  b.innerHTML+='<div class=\"co-fi\"><label>Nom complet *</label><input id=\"co-name\" type=\"text\" placeholder=\"Ex: Akosua Mensah\"></div>';\n";
  html += "  b.innerHTML+='<div class=\"co-fi\"><label>Téléphone / WhatsApp *</label><input id=\"co-ph\" type=\"tel\" placeholder=\"Ex: 22890000000\"></div>';\n";
  html += "  b.innerHTML+='<div class=\"co-fi\"><label>Adresse de livraison *</label><textarea id=\"co-addr\" placeholder=\"Quartier, rue, point de repère...\"></textarea></div>';\n";
  html += "  b.innerHTML+='<div class=\"co-fi\"><label>Mode de paiement</label><select id=\"co-pay\"><option value=\"mobile_money\">📱 Mobile Money (MTN, Moov, Wave)</option><option value=\"cash\">💵 Paiement à la livraison</option><option value=\"orange_money\">🟠 Orange Money</option></select></div>';\n";
  html += "  b.innerHTML+='<button class=\"btn-order\" id=\"co-btn\" onclick=\"submitOrder()\">✓ Confirmer la commande</button>';\n";
  html += "  toggleCart();document.getElementById('co-ov').classList.add('open');}\n";
  html += "function closeCO(){document.getElementById('co-ov').classList.remove('open');}\n";
  html += "async function submitOrder(){var name=document.getElementById('co-name').value.trim(),ph=document.getElementById('co-ph').value.trim(),addr=document.getElementById('co-addr').value.trim(),pay=document.getElementById('co-pay').value;if(!name||!ph||!addr){alert('Remplissez tous les champs obligatoires (*)');return;}var btn=document.getElementById('co-btn');btn.disabled=true;btn.textContent='⏳ Envoi...';var items=Object.entries(cart).map(function(e){return{productId:e[0],quantity:e[1].qty};});try{var r=await fetch('/boutique/'+SLUG+'/order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({customerName:name,customerPhone:ph,address:addr,items:items,paymentMethod:pay})});var d=await r.json();if(d.success){cart={};updateCartUI();document.getElementById('co-body').innerHTML='<div class=\"co-ok-box\"><div class=\"co-ok\">🎉</div><h4>Commande confirmée !</h4><div class=\"co-num\">N° '+d.orderNumber+'</div><p>Le commerçant vous contactera bientôt.<br>Merci de votre confiance !</p><button onclick=\"closeCO()\" style=\"margin-top:18px;background:var(--p);color:white;border:none;padding:11px 26px;border-radius:8px;font-weight:700;cursor:pointer;font-family:inherit\">Fermer</button></div>';}else{btn.disabled=false;btn.textContent='Confirmer la commande';alert(d.error||'Erreur');}}catch(e){btn.disabled=false;btn.textContent='Confirmer la commande';alert('Erreur de connexion.');}}\n";
  html += "function filterCat(cat,btn){document.querySelectorAll('.ftab').forEach(function(b){b.classList.remove('active');});btn.classList.add('active');document.querySelectorAll('.product-card').forEach(function(c){c.style.display=(cat==='all'||c.getAttribute('data-cat')===cat)?'':'none';});}\n";
  html += "function changeTheme(t){document.querySelectorAll('.tdot').forEach(function(d){d.classList.remove('active');});event.target.classList.add('active');document.getElementById('tpan').classList.remove('open');var labels={'mode':'👗 Mode','food':'🍽️ Alimentation','beaute':'💄 Beauté','tech':'📱 High-Tech','epicerie':'🛒 Épicerie','artisanat':'🏺 Artisanat','sante':'💊 Santé','bijoux':'💍 Bijoux','sport':'⚽ Sport','maison':'🏠 Maison','bebe':'👶 Bébé','services':'🔧 Services','education':'🎓 Éducation','orange':'🏪 Général'};var lbl=document.getElementById('theme-lbl');if(lbl)lbl.textContent=labels[t]||t;fetch('/boutique/'+SLUG+'/theme',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({theme:t,merchantId:MID})}).then(function(){location.reload();}).catch(function(){});}\n";
  html += "(function(){fetch('/api/announcements/active').then(function(r){if(!r.ok)return null;return r.json();}).then(function(ann){if(!ann)return;if(sessionStorage.getItem('ann_'+ann.id))return;var C={info:{bg:'#1e3a5f',c:'#93c5fd',i:'ℹ️'},update:{bg:'#064e3b',c:'#6ee7b7',i:'🚀'},promo:{bg:'#78350f',c:'#fcd34d',i:'🎁'},warning:{bg:'#7f1d1d',c:'#fca5a5',i:'⚠️'}};var col=C[ann.type]||C.info;var b=document.getElementById('ann-banner');b.style.background=col.bg;b.style.color=col.c;document.getElementById('ann-ic').textContent=col.i;var te=document.getElementById('ann-txt'),txt=ann.title+' — '+ann.message;te.textContent=txt;if(txt.length>80)te.classList.add('scroll');b.dataset.annId=ann.id;b.classList.add('show');document.body.style.paddingTop=(b.offsetHeight+4)+'px';}).catch(function(){});})();\n";
  html += "function closeBanner(){var b=document.getElementById('ann-banner');if(!b)return;b.style.display='none';document.body.style.paddingTop='';try{if(b.dataset.annId)sessionStorage.setItem('ann_'+b.dataset.annId,'1');}catch(e){}}\n";
  html += "var chatO=false,chatS=false;\n";
  html += "function toggleChat(){chatO=!chatO;document.getElementById('chat-box').classList.toggle('open',chatO);document.getElementById('ch-icon').innerHTML=chatO?'<svg width=\"19\" height=\"19\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\"><line x1=\"18\" y1=\"6\" x2=\"6\" y2=\"18\"/><line x1=\"6\" y1=\"6\" x2=\"18\" y2=\"18\"/></svg>':'<svg width=\"22\" height=\"22\" viewBox=\"0 0 24 24\" fill=\"currentColor\"><path d=\"M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z\"/></svg>';document.getElementById('ch-notif').style.display='none';if(chatO&&!chatS){chatS=true;setTimeout(function(){addBotMsg('Bonjour ! 👋 Bienvenue chez "+safeShopName+". Comment puis-je vous aider ?');},300);}}\n";
  html += "function addBotMsg(t){var e=document.createElement('div');e.className='cm bot';e.innerHTML=t.replace(/\\n/g,'<br>').replace(/\\*(.*?)\\*/g,'<strong>$1</strong>');document.getElementById('chat-msgs').appendChild(e);scM();}\n";
  html += "function addUserMsg(t){var e=document.createElement('div');e.className='cm user';e.textContent=t;document.getElementById('chat-msgs').appendChild(e);scM();}\n";
  html += "function showTyp(){var e=document.createElement('div');e.className='cm bot typing-cm';e.id='typ';e.innerHTML='<span></span><span></span><span></span>';document.getElementById('chat-msgs').appendChild(e);scM();}\n";
  html += "function rmTyp(){var t=document.getElementById('typ');if(t)t.remove();}\n";
  html += "function scM(){var m=document.getElementById('chat-msgs');m.scrollTop=m.scrollHeight;}\n";
  html += "async function sendBotMsg(){var inp=document.getElementById('ch-inp'),t=inp.value.trim();if(!t)return;inp.value='';addUserMsg(t);showTyp();try{var r=await fetch('/boutique/'+SLUG+'/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:t})});var d=await r.json();rmTyp();setTimeout(function(){addBotMsg(d.reply||'Pouvez-vous reformuler ?');},120);}catch(e){rmTyp();addBotMsg('Désolé, problème technique. Contactez-nous sur WhatsApp !');}}\n";
  html += "function sendQuick(q){document.getElementById('ch-inp').value=q;sendBotMsg();}\n";
  html += "setTimeout(function(){if(!chatO)document.getElementById('ch-notif').style.display='flex';},3500);\n";
  html += "</script>\n</body>\n</html>";

  return html;
};

module.exports = router;