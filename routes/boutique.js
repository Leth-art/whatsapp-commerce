/**
 * boutique.js — Route pour les mini-sites automatiques des commerçants
 * GET /boutique/:slug — Affiche le site public du commerçant
 * PATCH /boutique/:slug/theme — Change le thème (depuis dashboard)
 */

const express = require("express");
const router = express.Router();
const { Merchant, Product } = require("../models/index");

// ─── Thèmes disponibles ───────────────────────────────────────────────────────
const THEMES = {
  orange: { primary: "#E85C0E", secondary: "#FF9A00", bg: "#0a0508", surface: "#150d0a", text: "#F5F0EE" },
  green:  { primary: "#00E5A0", secondary: "#00B37D", bg: "#050a08", surface: "#0a150f", text: "#EEF5F2" },
  purple: { primary: "#7C5CFC", secondary: "#A855F7", bg: "#07050a", surface: "#100a15", text: "#F0EEF5" },
  blue:   { primary: "#3B82F6", secondary: "#60A5FA", bg: "#05080a", surface: "#0a1015", text: "#EEF2F5" },
  red:    { primary: "#EF4444", secondary: "#F97316", bg: "#0a0505", surface: "#150a0a", text: "#F5EEEE" },
};

// ─── GET /boutique/:slug ──────────────────────────────────────────────────────
router.get("/:slug", async (req, res) => {
  try {
    const { slug } = req.params;

    // Cherche par slug
    const merchant = await Merchant.findOne({
      where: { shopSlug: slug, siteActive: true },
    });

    if (!merchant) {
      return res.status(404).send(`
        <!DOCTYPE html><html><head><meta charset="UTF-8"><title>Boutique introuvable</title>
        <style>body{background:#050508;color:#F0F0F8;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center}</style>
        </head><body><div><div style="font-size:48px;margin-bottom:16px">🔍</div>
        <h2>Boutique introuvable</h2><p style="color:#4A4A6A;margin-top:8px">Ce lien n'est pas valide.</p>
        <a href="/" style="color:#E85C0E;margin-top:20px;display:block">Créer votre boutique →</a></div></body></html>
      `);
    }

    // Récupère les produits disponibles
    const products = await Product.findAll({
      where: { merchantId: merchant.id, isAvailable: true },
      order: [["createdAt", "DESC"]],
    });

    const theme = THEMES[merchant.siteTheme] || THEMES.orange;
    const whatsappNumber = merchant.ownerPhone?.replace(/\D/g, "") || "";

    res.send(generateSiteHTML({ merchant, products, theme, whatsappNumber }));
  } catch (err) {
    console.error("Erreur boutique:", err.message);
    res.status(500).send("Erreur serveur");
  }
});

// ─── PATCH /boutique/:slug/theme ─────────────────────────────────────────────
router.patch("/:slug/theme", async (req, res) => {
  try {
    const { slug } = req.params;
    const { theme, merchantId } = req.body;

    if (!THEMES[theme]) return res.status(400).json({ error: "Thème invalide" });

    const merchant = await Merchant.findOne({ where: { shopSlug: slug, id: merchantId } });
    if (!merchant) return res.status(404).json({ error: "Boutique introuvable" });

    await merchant.update({ siteTheme: theme });
    res.json({ success: true, theme, siteUrl: `/boutique/${slug}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── POST /boutique/:slug/order ───────────────────────────────────────────────
router.post("/:slug/order", async (req, res) => {
  try {
    const { slug } = req.params;
    const { customerName, customerPhone, address, items, paymentMethod } = req.body;

    if (!customerName || !customerPhone || !address || !items || !items.length) {
      return res.status(400).json({ error: "Informations manquantes" });
    }

    const merchant = await Merchant.findOne({ where: { shopSlug: slug } });
    if (!merchant) return res.status(404).json({ error: "Boutique introuvable" });

    const { Customer, Order, ConversationSession } = require("../models/index");
    const { v4: uuidv4 } = require("uuid");

    // Créer ou trouver le client
    let customer = await Customer.findOne({
      where: { merchantId: merchant.id, whatsappNumber: customerPhone }
    });
    if (!customer) {
      customer = await Customer.create({
        id: uuidv4(),
        merchantId: merchant.id,
        whatsappNumber: customerPhone,
        name: customerName,
      });
    } else if (customerName && !customer.name) {
      await customer.update({ name: customerName });
    }

    // Calcul du total
    const products = await Product.findAll({ where: { merchantId: merchant.id } });
    let totalAmount = 0;
    const orderItems = [];

    for (const item of items) {
      const product = products.find(p => p.id === item.productId);
      if (!product) continue;
      const qty = parseInt(item.quantity) || 1;
      const subtotal = product.price * qty;
      totalAmount += subtotal;
      orderItems.push({
        productId: product.id,
        name: product.name,
        price: product.price,
        quantity: qty,
        total: subtotal,
      });
    }

    if (!orderItems.length) return res.status(400).json({ error: "Aucun produit valide" });

    // Créer la commande
    const orderNumber = "WB-" + Date.now().toString().slice(-6);
    const order = await Order.create({
      id: uuidv4(),
      orderNumber,
      merchantId: merchant.id,
      customerId: customer.id,
      items: orderItems,
      totalAmount,
      deliveryAddress: address,
      paymentMethod: paymentMethod || "mobile_money",
      status: "pending",
    });

    // Notifier le commerçant via WhatsApp si possible
    try {
      const { sendText } = require("../core/whatsappClient");
      const ADMIN_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
      const ADMIN_TOKEN = process.env.WHATSAPP_TOKEN;
      if (ADMIN_PHONE_ID && ADMIN_TOKEN && merchant.ownerPhone) {
        const itemsList = orderItems.map(i => `• ${i.name} x${i.quantity} — ${i.total.toLocaleString("fr-FR")} ${merchant.currency}`).join("\n");
        await sendText(ADMIN_PHONE_ID, ADMIN_TOKEN, merchant.ownerPhone,
          `🔔 *Nouvelle commande web — ${merchant.shopName || merchant.name}*\n\n` +
          `📦 N° : *${orderNumber}*\n${itemsList}\n\n` +
          `💰 Total : *${totalAmount.toLocaleString("fr-FR")} ${merchant.currency}*\n` +
          `📍 Livraison : ${address}\n` +
          `📱 Client : ${customerName} (${customerPhone})\n\n` +
          `👉 Dashboard : ${process.env.APP_BASE_URL || "https://whatsapp-commerce-1roe.onrender.com"}/merchant`
        ).catch(() => {});
      }
    } catch {}

    res.json({
      success: true,
      orderNumber,
      totalAmount,
      message: `Commande ${orderNumber} reçue ! Le commerçant vous contactera sous peu.`
    });
  } catch (err) {
    console.error("Erreur commande boutique:", err.message);
    res.status(500).json({ error: "Erreur lors de la commande" });
  }
});

// ─── Génération du HTML du site ───────────────────────────────────────────────
const generateSiteHTML = ({ merchant, products, theme, whatsappNumber }) => {
  const shopName = merchant.shopName || merchant.name;
  const description = merchant.businessDescription || `Bienvenue sur ${shopName}`;
  const city = merchant.city || "";
  const currency = merchant.currency || "XOF";

  const productsHTML = products.length === 0
    ? `<div class="empty"><div class="empty-icon">📦</div><p>Catalogue en cours de préparation...</p></div>`
    : products.map(p => {
        const waMsg = encodeURIComponent(`Bonjour ! Je suis intéressé(e) par *${p.name}* à ${Number(p.price).toLocaleString("fr-FR")} ${currency}. Est-ce disponible ?`);
        const waLink = whatsappNumber ? `https://wa.me/${whatsappNumber}?text=${waMsg}` : "#";
        return `
          <div class="product-card">
            ${p.imageUrl ? `<div class="product-img" style="background-image:url('${p.imageUrl}')"></div>`
              : `<div class="product-img placeholder"><span>${p.name.charAt(0).toUpperCase()}</span></div>`}
            <div class="product-body">
              <div class="product-category">${p.category || "Produit"}</div>
              <h3 class="product-name">${p.name}</h3>
              ${p.description ? `<p class="product-desc">${p.description.slice(0, 80)}${p.description.length > 80 ? "…" : ""}</p>` : ""}
              <div class="product-footer">
                <div class="product-price">${Number(p.price).toLocaleString("fr-FR")} <span>${currency}</span></div>
                <button class="btn-order" onclick="addToCart('${p.id}', '${p.name.replace(/'/g,"\\'")}', ${p.price})">🛒 Ajouter</button>
              </div>
            </div>
          </div>`;
      }).join("");

  const categoriesSet = [...new Set(products.map(p => p.category || "Divers"))];
  const categoriesHTML = categoriesSet.length > 1
    ? `<div class="categories">
        <button class="cat-btn active" onclick="filterCat('all', this)">Tout</button>
        ${categoriesSet.map(c => `<button class="cat-btn" onclick="filterCat('${c}', this)">${c}</button>`).join("")}
       </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${shopName}</title>
<meta name="description" content="${description}">
<meta property="og:title" content="${shopName}">
<meta property="og:description" content="${description}">
<style>
:root {
  --primary: ${theme.primary};
  --secondary: ${theme.secondary};
  --bg: ${theme.bg};
  --surface: ${theme.surface};
  --text: ${theme.text};
  --muted: rgba(255,255,255,0.4);
  --border: rgba(255,255,255,0.08);
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Segoe UI', system-ui, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }

/* HEADER */
.header {
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  padding: 16px 24px;
  display: flex; align-items: center; justify-content: space-between;
  position: sticky; top: 0; z-index: 100; backdrop-filter: blur(10px);
}
.header-logo { font-size: 20px; font-weight: 800; }
.header-logo span { color: var(--primary); }
.header-city { font-size: 12px; color: var(--muted); }
.btn-wa-header {
  background: #25D366; color: white; border: none;
  padding: 9px 16px; border-radius: 20px; font-size: 13px; font-weight: 700;
  cursor: pointer; text-decoration: none; display: flex; align-items: center; gap: 6px;
  transition: all 0.2s;
}
.btn-wa-header:hover { background: #1ebe58; transform: translateY(-1px); }

/* HERO */
.hero {
  background: linear-gradient(135deg, rgba(232,92,14,0.15) 0%, transparent 60%);
  background-color: var(--surface);
  border-bottom: 1px solid var(--border);
  padding: 48px 24px;
  text-align: center;
}
.hero-badge {
  display: inline-block; font-size: 11px; font-weight: 700; letter-spacing: 2px;
  text-transform: uppercase; color: var(--primary);
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
  padding: 4px 14px; border-radius: 20px; margin-bottom: 16px;
}
.hero h1 { font-size: clamp(28px, 5vw, 48px); font-weight: 800; line-height: 1.1; margin-bottom: 12px; }
.hero h1 span { color: var(--primary); }
.hero p { color: var(--muted); font-size: 16px; max-width: 480px; margin: 0 auto 28px; line-height: 1.6; }
.hero-btns { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
.btn-primary {
  background: var(--primary); color: white; border: none;
  padding: 13px 24px; border-radius: 12px; font-size: 15px; font-weight: 700;
  cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; gap: 8px;
  transition: all 0.2s;
}
.btn-primary:hover { transform: translateY(-2px); filter: brightness(1.1); }
.btn-outline {
  background: transparent; color: var(--text); border: 1px solid var(--border);
  padding: 13px 24px; border-radius: 12px; font-size: 15px; font-weight: 600;
  cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; gap: 8px;
  transition: all 0.2s;
}
.btn-outline:hover { border-color: var(--primary); color: var(--primary); }

/* CATALOGUE */
.catalogue { padding: 40px 24px; max-width: 1200px; margin: 0 auto; }
.catalogue-header { margin-bottom: 28px; }
.catalogue-header h2 { font-size: 22px; font-weight: 800; margin-bottom: 8px; }
.catalogue-header p { color: var(--muted); font-size: 14px; }

.categories { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 24px; }
.cat-btn {
  padding: 6px 16px; border-radius: 20px; font-size: 13px; font-weight: 600;
  border: 1px solid var(--border); background: transparent; color: var(--muted);
  cursor: pointer; transition: all 0.2s;
}
.cat-btn:hover, .cat-btn.active { background: var(--primary); color: white; border-color: var(--primary); }

.products-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }

.product-card {
  background: var(--surface); border: 1px solid var(--border); border-radius: 16px;
  overflow: hidden; transition: all 0.25s;
}
.product-card:hover { border-color: rgba(255,255,255,0.15); transform: translateY(-3px); }

.product-img {
  width: 100%; height: 180px;
  background-size: cover; background-position: center; background-color: rgba(255,255,255,0.05);
}
.product-img.placeholder {
  display: flex; align-items: center; justify-content: center;
  font-size: 48px; font-weight: 800; color: var(--primary);
  background: linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.07));
}

.product-body { padding: 16px; }
.product-category { font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: var(--primary); font-weight: 700; margin-bottom: 6px; }
.product-name { font-size: 15px; font-weight: 700; margin-bottom: 6px; }
.product-desc { font-size: 12px; color: var(--muted); line-height: 1.5; margin-bottom: 12px; }
.product-footer { display: flex; align-items: center; justify-content: space-between; margin-top: auto; }
.product-price { font-size: 18px; font-weight: 800; color: var(--primary); }
.product-price span { font-size: 11px; font-weight: 400; color: var(--muted); }
.btn-order {
  background: #25D366; color: white; text-decoration: none;
  padding: 8px 14px; border-radius: 10px; font-size: 12px; font-weight: 700;
  transition: all 0.2s; white-space: nowrap;
}
.btn-order:hover { background: #1ebe58; }

/* EMPTY */
.empty { text-align: center; padding: 60px 24px; color: var(--muted); }
.empty-icon { font-size: 48px; margin-bottom: 12px; }

/* FOOTER */
.footer {
  background: var(--surface); border-top: 1px solid var(--border);
  padding: 24px; text-align: center; margin-top: 40px;
}
.footer p { font-size: 12px; color: var(--muted); line-height: 1.8; }
.footer a { color: var(--primary); text-decoration: none; }

/* THEME SWITCHER */
.theme-switcher {
  position: fixed; bottom: 24px; right: 24px; z-index: 200;
}
.theme-btn {
  width: 48px; height: 48px; border-radius: 50%; border: 2px solid var(--border);
  cursor: pointer; font-size: 20px; display: flex; align-items: center; justify-content: center;
  background: var(--surface); box-shadow: 0 4px 20px rgba(0,0,0,0.3); transition: all 0.2s;
}
.theme-btn:hover { transform: scale(1.1); }
.theme-panel {
  position: absolute; bottom: 60px; right: 0;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 16px; padding: 16px; display: none; min-width: 180px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
}
.theme-panel.open { display: block; }
.theme-panel h4 { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: var(--muted); margin-bottom: 12px; }
.theme-options { display: flex; gap: 8px; flex-wrap: wrap; }
.theme-dot {
  width: 32px; height: 32px; border-radius: 50%; cursor: pointer;
  border: 3px solid transparent; transition: all 0.2s;
}
.theme-dot:hover, .theme-dot.active { border-color: white; transform: scale(1.15); }

/* FLOATING WA */
.wa-float {
  position: fixed; bottom: 24px; left: 24px; z-index: 200;
  display: flex; align-items: center; gap: 10px;
  background: #25D366; color: white; text-decoration: none;
  padding: 12px 18px; border-radius: 30px; font-weight: 700; font-size: 14px;
  box-shadow: 0 4px 20px rgba(37,211,102,0.4); transition: all 0.2s;
}
.wa-float:hover { transform: translateY(-2px); box-shadow: 0 6px 28px rgba(37,211,102,0.5); }


/* ORDER MODAL */
.order-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(4px);
  z-index: 400; display: none; align-items: center; justify-content: center; padding: 20px;
}
.order-overlay.open { display: flex; }
.order-modal {
  background: var(--surface); border: 1px solid var(--border); border-radius: 20px;
  width: 100%; max-width: 480px; max-height: 90vh; overflow-y: auto;
  animation: slideUp 0.3s ease;
}
.order-modal-header {
  padding: 20px 24px; border-bottom: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0;
  background: var(--surface); z-index: 1;
}
.order-modal-header h3 { font-size: 17px; font-weight: 800; }
.order-modal-close { background: none; border: none; color: var(--muted); font-size: 20px; cursor: pointer; }
.order-modal-body { padding: 20px 24px; }
.cart-items { margin-bottom: 20px; }
.cart-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 0; border-bottom: 1px solid var(--border); gap: 10px;
}
.cart-item:last-child { border-bottom: none; }
.cart-item-name { font-size: 14px; font-weight: 600; flex: 1; }
.cart-item-qty { display: flex; align-items: center; gap: 8px; }
.qty-btn {
  width: 28px; height: 28px; border-radius: 8px; border: 1px solid var(--border);
  background: rgba(255,255,255,0.05); color: var(--text); font-size: 16px;
  cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;
}
.qty-btn:hover { border-color: var(--primary); color: var(--primary); }
.cart-item-price { font-size: 14px; font-weight: 700; color: var(--primary); min-width: 80px; text-align: right; }
.cart-total {
  background: rgba(255,255,255,0.04); border-radius: 12px; padding: 14px 16px;
  display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;
}
.cart-total-label { font-size: 13px; color: var(--muted); }
.cart-total-amount { font-size: 20px; font-weight: 800; color: var(--primary); }
.order-form { display: flex; flex-direction: column; gap: 14px; }
.order-form label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--muted); display: block; margin-bottom: 5px; }
.order-form input, .order-form select, .order-form textarea {
  width: 100%; background: rgba(255,255,255,0.05); border: 1px solid var(--border);
  color: var(--text); padding: 11px 14px; border-radius: 12px; font-size: 14px;
  font-family: inherit; outline: none; transition: border-color 0.2s;
}
.order-form input:focus, .order-form select:focus, .order-form textarea:focus { border-color: var(--primary); }
.order-form textarea { resize: none; min-height: 80px; }
.btn-submit-order {
  width: 100%; padding: 14px; background: var(--primary); color: white; border: none;
  border-radius: 12px; font-size: 15px; font-weight: 700; cursor: pointer;
  font-family: inherit; transition: all 0.2s; margin-top: 6px;
}
.btn-submit-order:hover { filter: brightness(1.1); }
.btn-submit-order:disabled { opacity: 0.6; cursor: not-allowed; }
.order-success {
  text-align: center; padding: 30px 20px;
}
.order-success .success-icon { font-size: 56px; margin-bottom: 16px; }
.order-success h4 { font-size: 18px; font-weight: 800; margin-bottom: 8px; }
.order-success p { color: var(--muted); font-size: 14px; line-height: 1.6; }
.cart-badge {
  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
  background: var(--primary); color: white; padding: 12px 24px; border-radius: 30px;
  font-weight: 700; font-size: 14px; cursor: pointer; z-index: 200;
  box-shadow: 0 4px 20px rgba(232,92,14,0.4); transition: all 0.3s;
  display: none; align-items: center; gap: 10px;
}
.cart-badge.show { display: flex; }
.cart-badge:hover { transform: translateX(-50%) translateY(-2px); }

/* RESPONSIVE */
@media (max-width: 600px) {
  .header { padding: 12px 16px; }
  .hero { padding: 32px 16px; }
  .catalogue { padding: 28px 16px; }
  .products-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .product-img { height: 130px; }
  .wa-float span { display: none; }
  .wa-float { padding: 14px; border-radius: 50%; }
}
</style>
</head>
<body>

<!-- HEADER -->
<header class="header">
  <div>
    <div class="header-logo">${shopName.split(' ').map((w,i) => i===0 ? `<span>${w}</span>` : ` ${w}`).join('')}</div>
    ${city ? `<div class="header-city">📍 ${city}</div>` : ""}
  </div>
  ${whatsappNumber ? `<a href="https://wa.me/${whatsappNumber}" target="_blank" class="btn-wa-header">💬 Nous écrire</a>` : ""}
</header>

<!-- HERO -->
<section class="hero">
  <div class="hero-badge">🛍️ Boutique officielle</div>
  <h1>${shopName.split(' ').map((w,i) => i===0 ? `<span>${w}</span>` : ` ${w}`).join('')}</h1>
  <p>${description}</p>
  <div class="hero-btns">
    ${whatsappNumber ? `<a href="https://wa.me/${whatsappNumber}" target="_blank" class="btn-primary">💬 Commander sur WhatsApp</a>` : ""}
    <a href="#catalogue" class="btn-outline">Voir les produits →</a>
  </div>
</section>

<!-- CATALOGUE -->
<section class="catalogue" id="catalogue">
  <div class="catalogue-header">
    <h2>Nos produits <span style="color:var(--primary)">(${products.length})</span></h2>
    <p>Ajoutez vos produits au panier et passez commande directement</p>
  </div>
  ${categoriesHTML}
  <div class="products-grid" id="products-grid">
    ${productsHTML}
  </div>
</section>

<!-- FOOTER -->
<footer class="footer">
  <p>
    ${shopName} ${city ? `· ${city}` : ""}<br>
    ${whatsappNumber ? `📱 <a href="https://wa.me/${whatsappNumber}">WhatsApp : +${whatsappNumber}</a><br>` : ""}
    <span style="opacity:0.4;font-size:11px">Propulsé par <a href="/">WaziBot</a> · <a href="/merchant?id=${merchant.id}" style="color:var(--primary)">Espace commerçant</a></span>
  </p>
</footer>

<!-- FLOATING WA -->
${whatsappNumber ? `<a href="https://wa.me/${whatsappNumber}" target="_blank" class="wa-float">💬 <span>Commander</span></a>` : ""}

<!-- THEME SWITCHER -->
<div class="theme-switcher">
  <div class="theme-panel" id="theme-panel">
    <h4>🎨 Thème</h4>
    <div class="theme-options">
      <div class="theme-dot ${merchant.siteTheme==='orange'?'active':''}" style="background:#E85C0E" onclick="changeTheme('orange')" title="Orange"></div>
      <div class="theme-dot ${merchant.siteTheme==='green'?'active':''}" style="background:#00E5A0" onclick="changeTheme('green')" title="Vert"></div>
      <div class="theme-dot ${merchant.siteTheme==='purple'?'active':''}" style="background:#7C5CFC" onclick="changeTheme('purple')" title="Violet"></div>
      <div class="theme-dot ${merchant.siteTheme==='blue'?'active':''}" style="background:#3B82F6" onclick="changeTheme('blue')" title="Bleu"></div>
      <div class="theme-dot ${merchant.siteTheme==='red'?'active':''}" style="background:#EF4444" onclick="changeTheme('red')" title="Rouge"></div>
    </div>
  </div>
  <button class="theme-btn" onclick="document.getElementById('theme-panel').classList.toggle('open')">🎨</button>
</div>

<script>
const SLUG = '${merchant.shopSlug}';
const MID = '${merchant.id}';

// Filtre catégorie
function filterCat(cat, btn) {
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.product-card').forEach(card => {
    const cardCat = card.querySelector('.product-category')?.textContent || '';
    card.style.display = (cat === 'all' || cardCat === cat) ? '' : 'none';
  });
}

// Change thème
async function changeTheme(theme) {
  document.querySelectorAll('.theme-dot').forEach(d => d.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById('theme-panel').classList.remove('open');
  try {
    await fetch('/boutique/' + SLUG + '/theme', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme, merchantId: MID })
    });
    location.reload();
  } catch {}
}
</script>

<!-- PANIER FLOTTANT -->
<div class="cart-badge" id="cart-badge" onclick="openOrderModal()">
  🛒 <span id="cart-count">0</span> article(s) · <span id="cart-total-badge">0</span> ${currency}
  <span style="font-weight:400;font-size:12px">→ Commander</span>
</div>

<!-- ORDER MODAL -->
<div class="order-overlay" id="order-overlay">
  <div class="order-modal">
    <div class="order-modal-header">
      <h3>🛒 Votre commande</h3>
      <button class="order-modal-close" onclick="closeOrderModal()">✕</button>
    </div>
    <div class="order-modal-body" id="order-modal-body">
      <!-- Rempli dynamiquement -->
    </div>
  </div>
</div>

<script>
// ── PANIER ────────────────────────────────────────────────────────────────────
const CURRENCY = '${currency}';
let cart = {}; // { productId: { name, price, qty } }

function addToCart(productId, name, price) {
  if (cart[productId]) {
    cart[productId].qty++;
  } else {
    cart[productId] = { name, price, qty: 1 };
  }
  updateCartBadge();
  showCartNotif(name);
}

function updateCartBadge() {
  const total = Object.values(cart).reduce((s, i) => s + i.qty, 0);
  const amount = Object.values(cart).reduce((s, i) => s + i.price * i.qty, 0);
  document.getElementById('cart-count').textContent = total;
  document.getElementById('cart-total-badge').textContent = amount.toLocaleString('fr-FR');
  const badge = document.getElementById('cart-badge');
  badge.classList.toggle('show', total > 0);
}

function showCartNotif(name) {
  const notif = document.createElement('div');
  notif.style.cssText = 'position:fixed;top:80px;right:20px;background:var(--primary);color:white;padding:10px 16px;border-radius:12px;font-size:13px;font-weight:600;z-index:500;animation:slideUp 0.3s ease;';
  notif.textContent = '✅ ' + name + ' ajouté !';
  document.body.appendChild(notif);
  setTimeout(() => notif.remove(), 2000);
}

function openOrderModal() {
  renderOrderModal();
  document.getElementById('order-overlay').classList.add('open');
}

function closeOrderModal() {
  document.getElementById('order-overlay').classList.remove('open');
}

function renderOrderModal() {
  const items = Object.entries(cart);
  if (!items.length) return;

  let itemsHTML = items.map(([id, item]) => \`
    <div class="cart-item" id="cart-item-\${id}">
      <div class="cart-item-name">\${item.name}</div>
      <div class="cart-item-qty">
        <button class="qty-btn" onclick="changeQty('\${id}', -1)">−</button>
        <span style="min-width:20px;text-align:center;font-weight:700">\${item.qty}</span>
        <button class="qty-btn" onclick="changeQty('\${id}', 1)">+</button>
      </div>
      <div class="cart-item-price">\${(item.price * item.qty).toLocaleString('fr-FR')} \${CURRENCY}</div>
    </div>
  \`).join('');

  const total = items.reduce((s, [, i]) => s + i.price * i.qty, 0);

  document.getElementById('order-modal-body').innerHTML = \`
    <div class="cart-items">\${itemsHTML}</div>
    <div class="cart-total">
      <span class="cart-total-label">Total à payer</span>
      <span class="cart-total-amount">\${total.toLocaleString('fr-FR')} \${CURRENCY}</span>
    </div>
    <div class="order-form">
      <div>
        <label>Votre nom *</label>
        <input type="text" id="order-name" placeholder="Ex: Akosua Mensah">
      </div>
      <div>
        <label>Téléphone / WhatsApp *</label>
        <input type="tel" id="order-phone" placeholder="Ex: 22890000000">
      </div>
      <div>
        <label>Adresse de livraison *</label>
        <textarea id="order-address" placeholder="Quartier, rue, point de repère..."></textarea>
      </div>
      <div>
        <label>Mode de paiement</label>
        <select id="order-payment">
          <option value="mobile_money">📱 Mobile Money (MTN, Moov, Wave)</option>
          <option value="cash">💵 Paiement à la livraison</option>
          <option value="orange_money">🟠 Orange Money</option>
        </select>
      </div>
      <button class="btn-submit-order" id="submit-order-btn" onclick="submitOrder()">
        ✅ Confirmer la commande
      </button>
    </div>
  \`;
}

function changeQty(productId, delta) {
  if (!cart[productId]) return;
  cart[productId].qty += delta;
  if (cart[productId].qty <= 0) delete cart[productId];
  updateCartBadge();
  if (Object.keys(cart).length === 0) { closeOrderModal(); return; }
  renderOrderModal();
}

async function submitOrder() {
  const name = document.getElementById('order-name')?.value.trim();
  const phone = document.getElementById('order-phone')?.value.trim();
  const address = document.getElementById('order-address')?.value.trim();
  const payment = document.getElementById('order-payment')?.value;

  if (!name || !phone || !address) {
    alert('Veuillez remplir tous les champs obligatoires (*)');
    return;
  }

  const btn = document.getElementById('submit-order-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Envoi en cours...';

  const items = Object.entries(cart).map(([productId, item]) => ({ productId, quantity: item.qty }));

  try {
    const r = await fetch('/boutique/' + SLUG + '/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerName: name, customerPhone: phone, address, items, paymentMethod: payment })
    });
    const data = await r.json();

    if (data.success) {
      cart = {};
      updateCartBadge();
      document.getElementById('order-modal-body').innerHTML = \`
        <div class="order-success">
          <div class="success-icon">🎉</div>
          <h4>Commande confirmée !</h4>
          <p>N° <strong>\${data.orderNumber}</strong><br><br>
          Le commerçant vous contactera bientôt pour confirmer la livraison.<br><br>
          Merci de votre confiance !</p>
          <button onclick="closeOrderModal()" style="margin-top:20px;padding:12px 24px;background:var(--primary);color:white;border:none;border-radius:12px;font-weight:700;cursor:pointer;font-family:inherit">
            Fermer
          </button>
        </div>
      \`;
    } else {
      btn.disabled = false;
      btn.textContent = '✅ Confirmer la commande';
      alert(data.error || 'Erreur lors de la commande');
    }
  } catch {
    btn.disabled = false;
    btn.textContent = '✅ Confirmer la commande';
    alert('Erreur de connexion. Réessayez !');
  }
}
</script>

</body>
</html>`;
};

module.exports = router;