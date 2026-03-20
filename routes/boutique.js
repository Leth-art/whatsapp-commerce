/**
 * boutique.js — Mini-sites Shopify-style pour les commerçants WaziBot
 */

const express = require("express");
const router = express.Router();
const { Merchant, Product } = require("../models/index");

// Thèmes par secteur d'activité
const THEMES = {
  // Mode & Vêtements
  mode:       { primary: "#C2185B", dark: "#AD1457", light: "#FCE4EC", bg: "#fff", surface: "#fdf6f9", text: "#1a1a1a", muted: "#6d7175", label: "👗 Mode & Vêtements" },
  // Alimentation & Restauration
  food:       { primary: "#E65100", dark: "#BF360C", light: "#FBE9E7", bg: "#fff", surface: "#fdf7f5", text: "#1a1a1a", muted: "#6d7175", label: "🍽️ Alimentation" },
  // Beauté & Cosmétiques
  beaute:     { primary: "#7B1FA2", dark: "#6A1B9A", light: "#F3E5F5", bg: "#fff", surface: "#faf5fc", text: "#1a1a1a", muted: "#6d7175", label: "💄 Beauté & Cosmétiques" },
  // High-Tech & Électronique
  tech:       { primary: "#0061c2", dark: "#004fa3", light: "#E3F2FD", bg: "#fff", surface: "#f5f9fe", text: "#1a1a1a", muted: "#6d7175", label: "📱 High-Tech" },
  // Épicerie & Supermarché
  epicerie:   { primary: "#2E7D32", dark: "#1B5E20", light: "#E8F5E9", bg: "#fff", surface: "#f4faf4", text: "#1a1a1a", muted: "#6d7175", label: "🛒 Épicerie" },
  // Artisanat & Décoration
  artisanat:  { primary: "#5D4037", dark: "#4E342E", light: "#EFEBE9", bg: "#fff", surface: "#faf8f7", text: "#1a1a1a", muted: "#6d7175", label: "🏺 Artisanat & Déco" },
  // Santé & Pharmacie
  sante:      { primary: "#00897B", dark: "#00695C", light: "#E0F2F1", bg: "#fff", surface: "#f3fbfa", text: "#1a1a1a", muted: "#6d7175", label: "💊 Santé & Pharmacie" },
  // Bijoux & Accessoires
  bijoux:     { primary: "#F9A825", dark: "#F57F17", light: "#FFFDE7", bg: "#fff", surface: "#fffdf0", text: "#1a1a1a", muted: "#6d7175", label: "💍 Bijoux & Accessoires" },
  // Sport & Fitness
  sport:      { primary: "#1565C0", dark: "#0D47A1", light: "#E3F2FD", bg: "#fff", surface: "#f5f8fe", text: "#1a1a1a", muted: "#6d7175", label: "⚽ Sport & Fitness" },
  // Maison & Mobilier
  maison:     { primary: "#558B2F", dark: "#33691E", light: "#F1F8E9", bg: "#fff", surface: "#f7fbf2", text: "#1a1a1a", muted: "#6d7175", label: "🏠 Maison & Mobilier" },
  // Bébé & Enfants
  bebe:       { primary: "#F06292", dark: "#E91E8C", light: "#FCE4EC", bg: "#fff", surface: "#fdf5f8", text: "#1a1a1a", muted: "#6d7175", label: "👶 Bébé & Enfants" },
  // Services & Professionnel
  services:   { primary: "#37474F", dark: "#263238", light: "#ECEFF1", bg: "#fff", surface: "#f6f8f9", text: "#1a1a1a", muted: "#6d7175", label: "🔧 Services" },
  // Aliases pour rétrocompat
  orange: { primary: "#E85C0E", dark: "#C44D0B", light: "#FEF0E8", bg: "#fff", surface: "#f6f6f7", text: "#1a1a1a", muted: "#6d7175", label: "🏪 Général" },
  green:  { primary: "#008060", dark: "#006048", light: "#E3F5F0", bg: "#fff", surface: "#f4f9f7", text: "#1a1a1a", muted: "#6d7175", label: "🏪 Général Vert" },
  purple: { primary: "#5c4db1", dark: "#4a3d92", light: "#EEF0FF", bg: "#fff", surface: "#f7f6fb", text: "#1a1a1a", muted: "#6d7175", label: "🏪 Général Violet" },
  blue:   { primary: "#0061c2", dark: "#004fa3", light: "#E8F1FF", bg: "#fff", surface: "#f6f8fb", text: "#1a1a1a", muted: "#6d7175", label: "🏪 Général Bleu" },
  red:    { primary: "#c0392b", dark: "#a93226", light: "#FDEEEC", bg: "#fff", surface: "#fdf6f6", text: "#1a1a1a", muted: "#6d7175", label: "🏪 Général Rouge" },
};

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
    const products = await Product.findAll({ where: { merchantId: merchant.id, isAvailable: true } });
    res.json({ reply: generateBotReply(message, merchant, products) });
  } catch { res.status(500).json({ reply: "Désolé, problème technique. Contactez-nous sur WhatsApp !" }); }
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

const generateSiteHTML = ({ merchant, products, theme, whatsappNumber }) => {
  const shopName = merchant.shopName || merchant.name;
  const description = merchant.businessDescription || ("Bienvenue chez " + shopName);
  const city = merchant.city || "";
  const currency = merchant.currency || "XOF";
  const cats = [...new Set(products.map(p => p.category || "Divers"))];
  const slug = merchant.shopSlug;
  const mid = merchant.id;
  const currentTheme = merchant.siteTheme || "orange";

  // Product cards — safe encoding for onclick data
  let productsHTML = "";
  if (products.length === 0) {
    productsHTML = '<div class="empty-state"><div style="font-size:48px;margin-bottom:12px">📦</div><p>Catalogue en cours de préparation...</p></div>';
  } else {
    products.forEach(function(p) {
      const safeId = p.id;
      const safeName = (p.name || "").replace(/\\/g, "\\\\").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
      const safeDesc = ((p.description || "").slice(0, 120)).replace(/\\/g, "\\\\").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
      const safeCat = (p.category || "").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
      const safeImg = (p.imageUrl || "").replace(/"/g, "&quot;");
      const price = Number(p.price);
      const cat = p.category || "Divers";

      const mediaContent = p.imageUrl
        ? '<img src="' + safeImg + '" alt="' + safeName + '" loading="lazy">'
        : '<div class="product-placeholder">' + (p.name || " ").charAt(0).toUpperCase() + '</div>';

      const descHTML = p.description
        ? '<p class="product-desc">' + (p.description.slice(0, 70)) + (p.description.length > 70 ? "…" : "") + '</p>'
        : "";

      productsHTML +=
        '<div class="product-card" data-cat="' + cat + '">' +
        '<div class="product-media" onclick="openQV(this)"' +
        ' data-id="' + safeId + '"' +
        ' data-name="' + safeName + '"' +
        ' data-price="' + price + '"' +
        ' data-img="' + safeImg + '"' +
        ' data-desc="' + safeDesc + '"' +
        ' data-cat="' + safeCat + '">' +
        mediaContent +
        '<div class="quick-view-hint">Aperçu rapide</div>' +
        '</div>' +
        '<div class="product-info">' +
        '<div class="product-vendor">' + cat + '</div>' +
        '<h3 class="product-title">' + (p.name || "") + '</h3>' +
        descHTML +
        '<div class="product-bottom">' +
        '<div class="product-price">' + price.toLocaleString("fr-FR") + '<span class="price-unit"> ' + currency + '</span></div>' +
        '<button class="btn-add" onclick="event.stopPropagation();addCartFromCard(this)"' +
        ' data-id="' + safeId + '"' +
        ' data-name="' + safeName + '"' +
        ' data-price="' + price + '"' +
        ' data-img="' + safeImg + '">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
        'Ajouter' +
        '</button>' +
        '</div></div></div>';
    });
  }

  // Categories filter
  let catsHTML = "";
  if (cats.length > 1) {
    catsHTML = '<div class="filter-tabs"><button class="ftab active" onclick="filterCat(\'all\',this)">Tout</button>';
    cats.forEach(function(cat) {
      catsHTML += '<button class="ftab" onclick="filterCat(\'' + cat.replace(/'/g, "\\'") + '\',this)">' + cat + '</button>';
    });
    catsHTML += '</div>';
  }

  // Logo split
  const logoWords = shopName.split(' ');
  const logoHTML = '<span>' + logoWords[0] + '</span>' + (logoWords.length > 1 ? ' ' + logoWords.slice(1).join(' ') : '');

  // Theme dots
  const themeList = [
    {key:'mode',color:'#C2185B',label:'👗 Mode'},
    {key:'food',color:'#E65100',label:'🍽️ Alimentation'},
    {key:'beaute',color:'#7B1FA2',label:'💄 Beauté'},
    {key:'tech',color:'#0061c2',label:'📱 High-Tech'},
    {key:'epicerie',color:'#2E7D32',label:'🛒 Épicerie'},
    {key:'artisanat',color:'#5D4037',label:'🏺 Artisanat'},
    {key:'sante',color:'#00897B',label:'💊 Santé'},
    {key:'bijoux',color:'#F9A825',label:'💍 Bijoux'},
    {key:'sport',color:'#1565C0',label:'⚽ Sport'},
    {key:'maison',color:'#558B2F',label:'🏠 Maison'},
    {key:'bebe',color:'#F06292',label:'👶 Bébé'},
    {key:'services',color:'#37474F',label:'🔧 Services'},
    {key:'orange',color:'#E85C0E',label:'🏪 Général'},
  ];
  let dotsHTML = '';
  let currentLabel = '🏪 Général';
  themeList.forEach(function(t) {
    const active = currentTheme === t.key ? ' active' : '';
    if (currentTheme === t.key) currentLabel = t.label;
    dotsHTML += '<div class="tdot' + active + '" style="background:' + t.color + '" onclick="changeTheme(\'' + t.key + '\')" title="' + t.label + '"></div>';
  });

  // Footer WA link
  const waLink = whatsappNumber
    ? '<a href="https://wa.me/' + whatsappNumber + '" target="_blank" style="display:inline-flex;align-items:center;gap:6px;margin-top:12px;background:#25D366;color:white;padding:8px 16px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600">💬 WhatsApp</a>'
    : '';

  // Build page
  const p = theme.primary;
  const pd = theme.dark;
  const pl = theme.light;
  const bg = theme.bg;
  const sf = theme.surface;
  const tx = theme.text;
  const mt = theme.muted;

  let html = '<!DOCTYPE html>\n<html lang="fr">\n<head>\n';
  html += '<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">\n';
  html += '<title>' + shopName + '</title>\n';
  html += '<meta name="description" content="' + description.replace(/"/g,'&quot;') + '">\n';
  html += '<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">\n';
  html += '<style>\n';
  html += ':root{--p:' + p + ';--pd:' + pd + ';--pl:' + pl + ';--bg:' + bg + ';--sf:' + sf + ';--tx:' + tx + ';--mt:' + mt + ';--bd:#e1e3e5;--r:8px;}\n';
  html += '*{margin:0;padding:0;box-sizing:border-box}html{scroll-behavior:smooth}\n';
  html += 'body{font-family:\'Plus Jakarta Sans\',sans-serif;background:var(--bg);color:var(--tx);min-height:100vh;-webkit-font-smoothing:antialiased}\n';
  html += '.ann-banner{position:fixed;top:0;left:0;right:0;z-index:9999;padding:9px 16px;display:none;align-items:center;gap:10px;font-size:13px;font-weight:600}\n';
  html += '.ann-banner.show{display:flex}.ann-txt{flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}\n';
  html += '.ann-txt.scroll{animation:scrollTxt 20s linear infinite;display:inline-block}\n';
  html += '@keyframes scrollTxt{0%{transform:translateX(80%)}100%{transform:translateX(-100%)}}\n';
  html += '.ann-x{background:none;border:none;cursor:pointer;font-size:18px;opacity:.7;color:inherit}\n';
  html += '.topbar{background:var(--tx);color:rgba(255,255,255,.8);text-align:center;padding:8px 16px;font-size:12px;font-weight:500}\n';
  html += '.hdr{background:white;border-bottom:1px solid var(--bd);position:sticky;top:0;z-index:100}\n';
  html += '.hdr-in{max-width:1280px;margin:0 auto;padding:0 24px;height:64px;display:flex;align-items:center;justify-content:space-between;gap:16px}\n';
  html += '.logo{font-size:21px;font-weight:800;color:var(--tx);text-decoration:none;letter-spacing:-.4px}.logo span{color:var(--p)}\n';
  html += '.hdr-loc{font-size:11px;color:var(--mt);margin-top:2px}\n';
  html += '.hdr-actions{display:flex;align-items:center;gap:8px}\n';
  html += '.btn-wa{background:var(--p);color:white;border:none;padding:9px 18px;border-radius:var(--r);font-size:13px;font-weight:600;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:6px;transition:.15s;font-family:inherit}\n';
  html += '.btn-wa:hover{background:var(--pd)}\n';
  html += '.cart-icon-btn{position:relative;background:var(--sf);border:1px solid var(--bd);width:40px;height:40px;border-radius:var(--r);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:.15s;color:var(--tx)}\n';
  html += '.cart-icon-btn:hover{border-color:var(--p);color:var(--p)}\n';
  html += '.cart-pill{position:absolute;top:-7px;right:-7px;background:var(--p);color:white;width:18px;height:18px;border-radius:50%;font-size:10px;font-weight:700;display:none;align-items:center;justify-content:center;border:2px solid white}\n';
  html += '.cart-pill.show{display:flex}\n';
  html += '.hero{background:var(--sf);border-bottom:1px solid var(--bd);padding:52px 24px}\n';
  html += '.hero-in{max-width:1280px;margin:0 auto;display:grid;grid-template-columns:1fr 400px;gap:48px;align-items:center}\n';
  html += '.hero-badge{display:inline-flex;align-items:center;gap:6px;background:var(--pl);color:var(--p);font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;padding:5px 12px;border-radius:20px;margin-bottom:16px}\n';
  html += '.hero h1{font-size:clamp(26px,4vw,44px);font-weight:800;line-height:1.15;margin-bottom:12px;letter-spacing:-.5px}\n';
  html += '.hero h1 em{font-style:normal;color:var(--p)}\n';
  html += '.hero p{color:var(--mt);font-size:15px;line-height:1.7;margin-bottom:28px;max-width:400px}\n';
  html += '.hero-cta{display:flex;gap:10px;flex-wrap:wrap}\n';
  html += '.btn-hp{background:var(--p);color:white;border:none;padding:13px 26px;border-radius:var(--r);font-size:14px;font-weight:700;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:7px;transition:.15s;font-family:inherit}\n';
  html += '.btn-hp:hover{background:var(--pd)}\n';
  html += '.btn-hs{background:white;color:var(--tx);border:1.5px solid var(--bd);padding:12px 22px;border-radius:var(--r);font-size:14px;font-weight:600;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:7px;transition:.15s;font-family:inherit}\n';
  html += '.btn-hs:hover{border-color:var(--p);color:var(--p)}\n';
  html += '.hero-vis{background:var(--pl);border-radius:20px;padding:40px 32px;text-align:center;min-height:280px;display:flex;flex-direction:column;align-items:center;justify-content:center}\n';
  html += '.hero-vis-emoji{font-size:72px;margin-bottom:16px}\n';
  html += '.hero-stats{display:flex;gap:28px;justify-content:center}\n';
  html += '.hstat-n{font-size:22px;font-weight:800;color:var(--p)}.hstat-l{font-size:10px;color:var(--mt);text-transform:uppercase;letter-spacing:.8px;margin-top:2px}\n';
  html += '.feat-band{background:white;border-bottom:1px solid var(--bd)}\n';
  html += '.feat-in{max-width:1280px;margin:0 auto;display:grid;grid-template-columns:repeat(3,1fr)}\n';
  html += '.feat-item{display:flex;align-items:center;gap:12px;padding:20px 24px;border-right:1px solid var(--bd)}.feat-item:last-child{border-right:none}\n';
  html += '.feat-ttl{font-size:13px;font-weight:700}.feat-sub{font-size:12px;color:var(--mt);margin-top:1px}\n';
  html += '.cat-section{max-width:1280px;margin:0 auto;padding:48px 24px}\n';
  html += '.cat-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;gap:16px;flex-wrap:wrap}\n';
  html += '.cat-ttl{font-size:20px;font-weight:800;letter-spacing:-.3px}.cat-cnt{font-size:13px;color:var(--mt);margin-top:3px}\n';
  html += '.filter-tabs{display:flex;gap:6px;flex-wrap:wrap}\n';
  html += '.ftab{padding:7px 15px;border-radius:20px;font-size:12px;font-weight:600;border:1.5px solid var(--bd);background:transparent;color:var(--mt);cursor:pointer;transition:.15s;font-family:inherit}\n';
  html += '.ftab:hover,.ftab.active{background:var(--p);color:white;border-color:var(--p)}\n';
  html += '.pgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(225px,1fr));gap:20px}\n';
  html += '.product-card{background:white;border:1px solid var(--bd);border-radius:12px;overflow:hidden;transition:.2s;cursor:pointer}\n';
  html += '.product-card:hover{box-shadow:0 4px 20px rgba(0,0,0,.13);transform:translateY(-2px);border-color:transparent}\n';
  html += '.product-media{position:relative;padding-top:100%;overflow:hidden;background:var(--sf)}\n';
  html += '.product-media img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform .4s}\n';
  html += '.product-card:hover .product-media img{transform:scale(1.05)}\n';
  html += '.product-placeholder{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:52px;font-weight:800;color:var(--p);background:var(--pl)}\n';
  html += '.quick-view-hint{position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,.65);color:white;font-size:11px;font-weight:600;text-align:center;padding:8px;opacity:0;transition:.2s}\n';
  html += '.product-card:hover .quick-view-hint{opacity:1}\n';
  html += '.product-info{padding:12px 14px 14px}\n';
  html += '.product-vendor{font-size:10px;color:var(--mt);text-transform:uppercase;letter-spacing:1px;margin-bottom:3px;font-weight:500}\n';
  html += '.product-title{font-size:14px;font-weight:700;margin-bottom:3px;line-height:1.3}\n';
  html += '.product-desc{font-size:11px;color:var(--mt);line-height:1.5;margin-bottom:8px}\n';
  html += '.product-bottom{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:8px}\n';
  html += '.product-price{font-size:16px;font-weight:800}.price-unit{font-size:10px;font-weight:500;color:var(--mt)}\n';
  html += '.btn-add{background:var(--p);color:white;border:none;padding:8px 12px;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:4px;transition:.15s;font-family:inherit;white-space:nowrap}\n';
  html += '.btn-add:hover{background:var(--pd)}.empty-state{text-align:center;padding:72px 24px;color:var(--mt)}\n';
  html += '.ftr{background:#1a1a1a;color:rgba(255,255,255,.7);padding:40px 24px 28px;margin-top:56px}\n';
  html += '.ftr-in{max-width:1280px;margin:0 auto}\n';
  html += '.ftr-top{display:flex;gap:40px;margin-bottom:32px;flex-wrap:wrap;justify-content:space-between}\n';
  html += '.ftr-brand h3{font-size:18px;font-weight:800;color:white;margin-bottom:6px}.ftr-brand p{font-size:13px;line-height:1.6;max-width:260px}\n';
  html += '.ftr-lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,.4);margin-bottom:10px}\n';
  html += '.ftr-links a{display:block;font-size:13px;color:rgba(255,255,255,.65);text-decoration:none;margin-bottom:7px}\n';
  html += '.ftr-links a:hover{color:white}\n';
  html += '.ftr-btm{border-top:1px solid rgba(255,255,255,.08);padding-top:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px}\n';
  html += '.ftr-btm p{font-size:12px;color:rgba(255,255,255,.35)}.ftr-btm a{color:var(--p);text-decoration:none;font-size:12px}\n';
  // Cart drawer
  html += '.cart-ov{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:500;opacity:0;pointer-events:none;transition:.25s}.cart-ov.open{opacity:1;pointer-events:all}\n';
  html += '.cart-drw{position:fixed;top:0;right:0;bottom:0;width:420px;background:white;z-index:501;transform:translateX(100%);transition:.3s cubic-bezier(.4,0,.2,1);display:flex;flex-direction:column;box-shadow:-8px 0 40px rgba(0,0,0,.12)}.cart-drw.open{transform:translateX(0)}\n';
  html += '.drw-hdr{padding:18px 22px;border-bottom:1px solid var(--bd);display:flex;align-items:center;justify-content:space-between}.drw-ttl{font-size:16px;font-weight:800}\n';
  html += '.drw-close{background:none;border:none;cursor:pointer;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--mt);transition:.15s}.drw-close:hover{background:var(--sf)}\n';
  html += '.drw-body{flex:1;overflow-y:auto;padding:18px 22px}.cart-es{text-align:center;padding:40px 0;color:var(--mt)}\n';
  html += '.ci{display:flex;gap:14px;padding:14px 0;border-bottom:1px solid var(--bd)}.ci:last-child{border-bottom:none}\n';
  html += '.ci-img{width:68px;height:68px;border-radius:8px;background:var(--sf);flex-shrink:0;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;color:var(--p)}\n';
  html += '.ci-img img{width:100%;height:100%;object-fit:cover}.ci-body{flex:1;min-width:0}\n';
  html += '.ci-name{font-size:13px;font-weight:600;margin-bottom:2px}.ci-price{font-size:13px;color:var(--p);font-weight:700}\n';
  html += '.ci-ctrl{display:flex;align-items:center;gap:8px;margin-top:8px}\n';
  html += '.qcb{width:26px;height:26px;border:1.5px solid var(--bd);background:transparent;border-radius:6px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:14px;transition:.15s}.qcb:hover{border-color:var(--p);color:var(--p)}\n';
  html += '.ci-rm{background:none;border:none;color:var(--mt);font-size:20px;cursor:pointer;margin-left:auto;line-height:1}.ci-rm:hover{color:#c0392b}\n';
  html += '.drw-ftr{padding:18px 22px;border-top:1px solid var(--bd);background:white}\n';
  html += '.drw-sub{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px}.drw-sub-lbl{font-size:13px;color:var(--mt)}.drw-sub-amt{font-size:20px;font-weight:800}\n';
  html += '.drw-note{font-size:11px;color:var(--mt);margin-bottom:14px}\n';
  html += '.btn-checkout{width:100%;background:var(--p);color:white;border:none;padding:14px;border-radius:var(--r);font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;transition:.15s;display:flex;align-items:center;justify-content:center;gap:7px}.btn-checkout:hover{background:var(--pd)}\n';
  html += '.btn-cont{width:100%;background:transparent;color:var(--mt);border:none;padding:10px;font-size:13px;cursor:pointer;font-family:inherit;margin-top:6px}\n';
  // QV modal
  html += '.qv-ov{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:550;display:none;align-items:center;justify-content:center;padding:20px}.qv-ov.open{display:flex}\n';
  html += '.qv-modal{background:white;border-radius:16px;width:100%;max-width:640px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.2)}\n';
  html += '.qv-inner{display:grid;grid-template-columns:1fr 1fr}.qv-media{background:var(--sf);position:relative;min-height:320px;display:flex;align-items:center;justify-content:center;overflow:hidden}\n';
  html += '.qv-media img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.qv-ph{font-size:72px;font-weight:800;color:var(--p)}\n';
  html += '.qv-info{padding:28px 22px;display:flex;flex-direction:column}.qv-vendor{font-size:10px;color:var(--mt);text-transform:uppercase;letter-spacing:1px;margin-bottom:5px}\n';
  html += '.qv-ttl{font-size:19px;font-weight:800;margin-bottom:6px}.qv-price{font-size:22px;font-weight:800;color:var(--p);margin-bottom:10px}\n';
  html += '.qv-desc{font-size:13px;color:var(--mt);line-height:1.6;margin-bottom:18px;flex:1}.qv-btns{display:flex;flex-direction:column;gap:8px}\n';
  html += '.btn-qv{background:var(--p);color:white;border:none;padding:13px;border-radius:var(--r);font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;transition:.15s;display:flex;align-items:center;justify-content:center;gap:7px}.btn-qv:hover{background:var(--pd)}\n';
  html += '.btn-qvc{background:var(--sf);color:var(--tx);border:1px solid var(--bd);padding:11px;border-radius:var(--r);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit}\n';
  // Checkout
  html += '.co-ov{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:600;display:none;align-items:center;justify-content:center;padding:20px}.co-ov.open{display:flex}\n';
  html += '.co-modal{background:white;border-radius:16px;width:100%;max-width:480px;max-height:90vh;overflow-y:auto}\n';
  html += '.co-hdr{padding:18px 22px;border-bottom:1px solid var(--bd);display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:white;z-index:1}\n';
  html += '.co-hdr h3{font-size:16px;font-weight:800}.co-x{background:none;border:none;cursor:pointer;font-size:20px;color:var(--mt)}\n';
  html += '.co-body{padding:22px}.co-stl{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--mt);margin-bottom:12px}\n';
  html += '.co-sum{background:var(--sf);border-radius:10px;padding:14px;margin-bottom:20px}\n';
  html += '.co-si{display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px;color:var(--mt)}\n';
  html += '.co-si.total{font-weight:800;font-size:15px;color:var(--p);border-top:1px solid var(--bd);padding-top:8px;margin-top:4px;margin-bottom:0}\n';
  html += '.co-fi{margin-bottom:12px}.co-fi label{display:block;font-size:11px;font-weight:600;color:var(--tx);margin-bottom:4px}\n';
  html += '.co-fi input,.co-fi select,.co-fi textarea{width:100%;border:1.5px solid var(--bd);border-radius:var(--r);padding:10px 13px;font-size:14px;font-family:inherit;color:var(--tx);background:white;outline:none;transition:.15s}\n';
  html += '.co-fi input:focus,.co-fi select:focus,.co-fi textarea:focus{border-color:var(--p)}.co-fi textarea{resize:none;min-height:72px}\n';
  html += '.btn-order{width:100%;background:var(--p);color:white;border:none;padding:14px;border-radius:var(--r);font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:7px}\n';
  html += '.btn-order:hover{background:var(--pd)}.btn-order:disabled{opacity:.6;cursor:not-allowed}\n';
  html += '.co-ok-box{text-align:center;padding:32px 20px}.co-ok{width:68px;height:68px;background:#d4edda;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:30px;margin:0 auto 14px}\n';
  html += '.co-ok-box h4{font-size:17px;font-weight:800;margin-bottom:6px}.co-ok-box p{color:var(--mt);font-size:13px;line-height:1.6}\n';
  html += '.co-num{background:var(--pl);color:var(--p);font-weight:700;padding:4px 12px;border-radius:20px;font-size:12px;display:inline-block;margin:6px 0}\n';
  // Chat
  html += '.chat-w{position:fixed;bottom:24px;right:24px;z-index:400}\n';
  html += '.chat-tog{width:54px;height:54px;border-radius:50%;border:none;background:var(--p);color:white;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.18);transition:.2s;display:flex;align-items:center;justify-content:center;position:relative}\n';
  html += '.chat-tog:hover{transform:scale(1.08)}\n';
  html += '.chat-notif{position:absolute;top:-4px;right:-4px;width:17px;height:17px;background:#e74c3c;border-radius:50%;font-size:9px;font-weight:700;color:white;display:none;align-items:center;justify-content:center;border:2px solid white}\n';
  html += '.chat-box{position:absolute;bottom:66px;right:0;width:330px;background:white;border-radius:16px;overflow:hidden;display:none;box-shadow:0 8px 40px rgba(0,0,0,.14);border:1px solid var(--bd)}\n';
  html += '.chat-box.open{display:flex;flex-direction:column;animation:su .2s ease}\n';
  html += '@keyframes su{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}\n';
  html += '.chat-hdr{background:var(--p);padding:13px 15px;display:flex;align-items:center;justify-content:space-between}\n';
  html += '.ch-info{display:flex;align-items:center;gap:9px}.ch-av{width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:15px}\n';
  html += '.ch-name{font-weight:700;font-size:13px;color:white}.ch-st{font-size:10px;color:rgba(255,255,255,.75)}\n';
  html += '.ch-xbtn{background:none;border:none;color:rgba(255,255,255,.8);font-size:17px;cursor:pointer}\n';
  html += '.chat-msgs{padding:13px;height:250px;overflow-y:auto;display:flex;flex-direction:column;gap:8px}\n';
  html += '.chat-msgs::-webkit-scrollbar{width:3px}.chat-msgs::-webkit-scrollbar-thumb{background:var(--bd);border-radius:3px}\n';
  html += '.cm{max-width:86%;padding:8px 12px;border-radius:12px;font-size:13px;line-height:1.5}\n';
  html += '.cm.bot{background:var(--sf);color:var(--tx);border-radius:4px 12px 12px 12px;align-self:flex-start}\n';
  html += '.cm.user{background:var(--p);color:white;border-radius:12px 4px 12px 12px;align-self:flex-end}\n';
  html += '.typing-cm{display:flex;gap:4px;align-items:center;padding:9px 12px !important}\n';
  html += '.typing-cm span{width:6px;height:6px;background:var(--mt);border-radius:50%;animation:bn 1.2s infinite}\n';
  html += '.typing-cm span:nth-child(2){animation-delay:.2s}.typing-cm span:nth-child(3){animation-delay:.4s}\n';
  html += '@keyframes bn{0%,80%,100%{transform:scale(.8);opacity:.5}40%{transform:scale(1.2);opacity:1}}\n';
  html += '.chat-qks{padding:7px 10px;display:flex;gap:5px;flex-wrap:wrap;border-top:1px solid var(--bd)}\n';
  html += '.qk-btn{padding:4px 9px;border-radius:20px;border:1.5px solid var(--bd);background:transparent;color:var(--mt);font-size:11px;cursor:pointer;transition:.15s;font-family:inherit}\n';
  html += '.qk-btn:hover{border-color:var(--p);color:var(--p)}\n';
  html += '.chat-inp-w{padding:9px;border-top:1px solid var(--bd);display:flex;gap:7px}\n';
  html += '.ch-inp{flex:1;background:var(--sf);border:1.5px solid var(--bd);color:var(--tx);padding:8px 12px;border-radius:20px;font-size:13px;font-family:inherit;outline:none;transition:.15s}\n';
  html += '.ch-inp:focus{border-color:var(--p)}\n';
  html += '.ch-snd{width:32px;height:32px;border-radius:50%;background:var(--p);border:none;color:white;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:.15s;flex-shrink:0}.ch-snd:hover{background:var(--pd)}\n';
  // Theme switcher
  html += '.theme-sw{position:fixed;bottom:90px;left:22px;z-index:300}\n';
  html += '.theme-tog-btn{width:38px;height:38px;border-radius:50%;border:1.5px solid var(--bd);background:white;cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.08)}\n';
  html += '.theme-pan{position:absolute;bottom:46px;left:0;background:white;border:1px solid var(--bd);border-radius:12px;padding:14px;display:none;box-shadow:0 8px 24px rgba(0,0,0,.1);min-width:210px}\n';
  html += '.theme-pan.open{display:block}.theme-pan-lbl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--mt);margin-bottom:9px}\n';
  html += '.tdots{display:flex;flex-wrap:wrap;gap:6px}\n';
  html += '.tdot{width:26px;height:26px;border-radius:50%;cursor:pointer;border:3px solid transparent;transition:.2s}.tdot:hover,.tdot.active{border-color:#1a1a1a;transform:scale(1.1)}\n';
  html += '.wa-float{display:none;position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:#25D366;color:white;text-decoration:none;padding:11px 22px;border-radius:30px;font-weight:700;font-size:13px;box-shadow:0 4px 14px rgba(37,211,102,.4);z-index:299;align-items:center;gap:7px;white-space:nowrap}\n';
  html += '@media(max-width:900px){.hero-in{grid-template-columns:1fr}.hero-vis{display:none}.feat-in{grid-template-columns:1fr}.feat-item{border-right:none;border-bottom:1px solid var(--bd);padding:14px 16px}.feat-item:last-child{border-bottom:none}.cart-drw{width:100%}.qv-inner{grid-template-columns:1fr}.qv-media{min-height:200px}}\n';
  html += '@media(max-width:500px){.pgrid{grid-template-columns:repeat(2,1fr);gap:12px}.product-info{padding:9px 11px 11px}.hero{padding:36px 16px}.cat-section{padding:32px 16px}.hdr-in{padding:0 16px}.chat-w{bottom:80px;right:14px}.chat-box{width:290px;right:-14px}.theme-sw{bottom:80px;left:14px}.wa-float{display:flex}}\n';
  html += '</style></head><body>\n';

  // Banner
  html += '<div class="ann-banner" id="ann-banner"><span id="ann-ic">ℹ️</span><span class="ann-txt" id="ann-txt"></span><button class="ann-x" onclick="closeBanner()">✕</button></div>\n';

  // Topbar
  html += '<div class="topbar">🚚 Livraison disponible' + (city ? ' à ' + city + ' et environs' : '') + ' · 📱 Paiement Mobile Money accepté</div>\n';

  // Header
  html += '<header class="hdr"><div class="hdr-in"><div>';
  html += '<a href="#" class="logo">' + logoHTML + '</a>';
  if (city) html += '<div class="hdr-loc">📍 ' + city + '</div>';
  html += '</div><div class="hdr-actions">';
  if (whatsappNumber) html += '<a href="https://wa.me/' + whatsappNumber + '" target="_blank" class="btn-wa">💬 WhatsApp</a>';
  html += '<button class="cart-icon-btn" onclick="toggleCart()"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg><div class="cart-pill" id="cart-pill">0</div></button>';
  html += '</div></div></header>\n';

  // Hero
  html += '<section class="hero"><div class="hero-in"><div>';
  html += '<div class="hero-badge">🛍️ Boutique officielle</div>';
  html += '<h1>' + logoHTML + '</h1>';
  html += '<p>' + description + '</p>';
  html += '<div class="hero-cta"><a href="#catalogue" class="btn-hp">Voir les produits</a>';
  if (whatsappNumber) html += '<a href="https://wa.me/' + whatsappNumber + '" target="_blank" class="btn-hs">💬 Nous contacter</a>';
  html += '</div></div>';
  html += '<div class="hero-vis"><div class="hero-vis-emoji">🛍️</div><div class="hero-stats">';
  html += '<div><div class="hstat-n">' + products.length + '</div><div class="hstat-l">Produits</div></div>';
  html += '<div><div class="hstat-n">24/7</div><div class="hstat-l">Service</div></div>';
  html += '<div><div class="hstat-n">⭐</div><div class="hstat-l">Qualité</div></div>';
  html += '</div></div></div></section>\n';

  // Features band
  html += '<div class="feat-band"><div class="feat-in">';
  html += '<div class="feat-item"><span style="font-size:20px">🚚</span><div><div class="feat-ttl">Livraison rapide</div><div class="feat-sub">Sur place et environs</div></div></div>';
  html += '<div class="feat-item"><span style="font-size:20px">📱</span><div><div class="feat-ttl">Mobile Money</div><div class="feat-sub">MTN, Moov, Wave, Orange</div></div></div>';
  html += '<div class="feat-item"><span style="font-size:20px">✅</span><div><div class="feat-ttl">Qualité garantie</div><div class="feat-sub">Satisfaction assurée</div></div></div>';
  html += '</div></div>\n';

  // Catalogue
  html += '<section class="cat-section" id="catalogue"><div class="cat-hdr"><div>';
  html += '<h2 class="cat-ttl">Notre catalogue</h2>';
  html += '<p class="cat-cnt">' + products.length + ' produit' + (products.length > 1 ? 's' : '') + '</p>';
  html += '</div>' + catsHTML + '</div>';
  html += '<div class="pgrid" id="products-grid">' + productsHTML + '</div></section>\n';

  // Footer
  html += '<footer class="ftr"><div class="ftr-in"><div class="ftr-top"><div class="ftr-brand">';
  html += '<h3>' + shopName + '</h3><p>' + description + '</p>' + waLink;
  html += '</div><div><div class="ftr-lbl">Liens utiles</div><div class="ftr-links">';
  html += '<a href="#catalogue">Nos produits</a>';
  if (whatsappNumber) html += '<a href="https://wa.me/' + whatsappNumber + '" target="_blank">Nous contacter</a>';
  html += '</div></div></div>';
  html += '<div class="ftr-btm"><p>© ' + new Date().getFullYear() + ' ' + shopName + (city ? ' · ' + city : '') + '</p>';
  html += '<a href="/merchant?id=' + mid + '">Espace commerçant</a></div></div></footer>\n';

  // WA float
  if (whatsappNumber) html += '<a href="https://wa.me/' + whatsappNumber + '" target="_blank" class="wa-float">💬 Commander sur WhatsApp</a>\n';

  // Cart drawer
  html += '<div class="cart-ov" id="cart-ov" onclick="toggleCart()"></div>\n';
  html += '<div class="cart-drw" id="cart-drw">';
  html += '<div class="drw-hdr"><div class="drw-ttl">Mon panier (<span id="drw-cnt">0</span>)</div>';
  html += '<button class="drw-close" onclick="toggleCart()">✕</button></div>';
  html += '<div class="drw-body" id="drw-body"><div class="cart-es"><div style="font-size:44px;margin-bottom:8px">🛒</div><p style="font-size:14px;color:var(--mt);margin-bottom:16px">Votre panier est vide</p><button onclick="toggleCart()" style="background:var(--p);color:white;border:none;padding:9px 20px;border-radius:8px;font-weight:700;cursor:pointer;font-family:inherit;font-size:13px">Continuer</button></div></div>';
  html += '<div class="drw-ftr" id="drw-ftr" style="display:none">';
  html += '<div class="drw-sub"><span class="drw-sub-lbl">Sous-total</span><span class="drw-sub-amt" id="drw-amt">0</span></div>';
  html += '<p class="drw-note">Livraison calculée à la commande</p>';
  html += '<button class="btn-checkout" onclick="openCheckout()">Passer la commande →</button>';
  html += '<button class="btn-cont" onclick="toggleCart()">Continuer les achats</button>';
  html += '</div></div>\n';

  // Quick view
  html += '<div class="qv-ov" id="qv-ov"><div class="qv-modal"><div class="qv-inner">';
  html += '<div class="qv-media" id="qv-media"><div class="qv-ph" id="qv-ph"></div></div>';
  html += '<div class="qv-info"><div class="qv-vendor" id="qv-vnd"></div><h3 class="qv-ttl" id="qv-ttl"></h3>';
  html += '<div class="qv-price" id="qv-px"></div><p class="qv-desc" id="qv-dsc"></p>';
  html += '<div class="qv-btns"><button class="btn-qv" id="qv-add-btn">Ajouter au panier</button>';
  html += '<button class="btn-qvc" onclick="closeQV()">Fermer</button></div></div></div></div></div>\n';

  // Checkout
  html += '<div class="co-ov" id="co-ov"><div class="co-modal">';
  html += '<div class="co-hdr"><h3>Finaliser la commande</h3><button class="co-x" onclick="closeCO()">✕</button></div>';
  html += '<div class="co-body" id="co-body"></div></div></div>\n';

  // Theme switcher
  html += '<div class="theme-sw"><div class="theme-pan" id="tpan">';
  html += '<div class="theme-pan-lbl">🎨 Thème de la boutique</div>';
  html += '<div class="tdots">' + dotsHTML + '</div>';
  html += '<div style="font-size:10px;color:var(--mt);margin-top:8px;font-weight:600" id="theme-lbl">' + currentLabel + '</div>';
  html += '</div><button class="theme-tog-btn" onclick="document.getElementById(\'tpan\').classList.toggle(\'open\')">🎨</button></div>\n';

  // Chat bot
  html += '<div class="chat-w"><div class="chat-box" id="chat-box">';
  html += '<div class="chat-hdr"><div class="ch-info"><div class="ch-av">🤖</div>';
  html += '<div><div class="ch-name">Assistant ' + shopName + '</div><div class="ch-st">● En ligne · Répond instantanément</div></div></div>';
  html += '<button class="ch-xbtn" onclick="toggleChat()">✕</button></div>';
  html += '<div class="chat-msgs" id="chat-msgs"></div>';
  html += '<div class="chat-qks">';
  html += '<button class="qk-btn" onclick="sendQuick(\'catalogue\')">🛍️ Catalogue</button>';
  html += '<button class="qk-btn" onclick="sendQuick(\'livraison\')">🚚 Livraison</button>';
  html += '<button class="qk-btn" onclick="sendQuick(\'paiement\')">💳 Paiement</button>';
  html += '<button class="qk-btn" onclick="sendQuick(\'contact\')">📞 Contact</button>';
  html += '</div>';
  html += '<div class="chat-inp-w"><input class="ch-inp" id="ch-inp" placeholder="Posez votre question..." onkeydown="if(event.key===\'Enter\')sendBotMsg()"><button class="ch-snd" onclick="sendBotMsg()"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button></div>';
  html += '</div>';
  html += '<button class="chat-tog" onclick="toggleChat()"><span id="ch-icon"><svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg></span><div class="chat-notif" id="ch-notif">1</div></button>';
  html += '</div>\n';

  // JavaScript — NO template literals, NO escaping issues
  html += '<script>\n';
  html += 'var SLUG="' + slug + '";var MID="' + mid + '";var CUR="' + currency + '";\n';
  html += 'var cart={};\n';

  // Cart functions
  html += 'function addCartFromCard(btn){var id=btn.getAttribute("data-id");var name=btn.getAttribute("data-name");var price=parseFloat(btn.getAttribute("data-price"));var img=btn.getAttribute("data-img");addToCart(id,name,price,img);}\n';
  html += 'function addToCart(id,name,price,img){if(cart[id])cart[id].qty++;else cart[id]={name:name,price:price,qty:1,img:img||""};updateCartUI();showAddedToast(name);if(!cOpen)openCart();}\n';
  html += 'function updateCartUI(){\n';
  html += '  var tot=Object.values(cart).reduce(function(s,i){return s+i.qty;},0);\n';
  html += '  var amt=Object.values(cart).reduce(function(s,i){return s+i.price*i.qty;},0);\n';
  html += '  var pill=document.getElementById("cart-pill");\n';
  html += '  pill.textContent=tot;pill.classList.toggle("show",tot>0);\n';
  html += '  document.getElementById("drw-cnt").textContent=tot;\n';
  html += '  document.getElementById("drw-amt").textContent=amt.toLocaleString("fr-FR")+" "+CUR;\n';
  html += '  var body=document.getElementById("drw-body");\n';
  html += '  var ftr=document.getElementById("drw-ftr");\n';
  html += '  if(!tot){\n';
  html += '    body.innerHTML=\'<div class="cart-es"><div style="font-size:44px;margin-bottom:8px">🛒</div><p style="font-size:14px;color:var(--mt);margin-bottom:16px">Votre panier est vide</p><button onclick="toggleCart()" style="background:var(--p);color:white;border:none;padding:9px 20px;border-radius:8px;font-weight:700;cursor:pointer;font-family:inherit;font-size:13px">Continuer</button></div>\';\n';
  html += '    ftr.style.display="none";\n';
  html += '  } else {\n';
  html += '    var items=Object.entries(cart);\n';
  html += '    var html2="";\n';
  html += '    items.forEach(function(entry){var id=entry[0];var it=entry[1];\n';
  html += '      html2+=\'<div class="ci"><div class="ci-img">\'+(it.img?\'<img src="\'+it.img+\'" alt="">\':it.name.charAt(0))+\'</div>\';\n';
  html += '      html2+=\'<div class="ci-body"><div class="ci-name">\'+it.name+\'</div>\';\n';
  html += '      html2+=\'<div class="ci-price">\'+(it.price*it.qty).toLocaleString("fr-FR")+" "+CUR+\'</div>\';\n';
  html += '      html2+=\'<div class="ci-ctrl"><button class="qcb" onclick="cqty(\\"\'+id+\'\\", -1)">−</button>\';\n';
  html += '      html2+=\'<span style="min-width:18px;text-align:center;font-weight:700">\'+it.qty+\'</span>\';\n';
  html += '      html2+=\'<button class="qcb" onclick="cqty(\\"\'+id+\'\\", 1)">+</button>\';\n';
  html += '      html2+=\'<button class="ci-rm" onclick="removeCI(\\"\'+id+\'\\")">×</button></div></div></div>\';\n';
  html += '    });\n';
  html += '    body.innerHTML=html2;\n';
  html += '    ftr.style.display="block";\n';
  html += '  }\n';
  html += '}\n';
  html += 'function cqty(id,d){if(!cart[id])return;cart[id].qty+=d;if(cart[id].qty<=0)delete cart[id];updateCartUI();}\n';
  html += 'function removeCI(id){delete cart[id];updateCartUI();}\n';
  html += 'var cOpen=false;\n';
  html += 'function toggleCart(){cOpen=!cOpen;document.getElementById("cart-ov").classList.toggle("open",cOpen);document.getElementById("cart-drw").classList.toggle("open",cOpen);}\n';
  html += 'function openCart(){cOpen=true;document.getElementById("cart-ov").classList.add("open");document.getElementById("cart-drw").classList.add("open");}\n';
  html += 'function showAddedToast(n){var t=document.createElement("div");t.style.cssText="position:fixed;top:78px;right:20px;background:#1a1a1a;color:white;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:600;z-index:600;box-shadow:0 4px 12px rgba(0,0,0,.2)";t.textContent="✓ "+n+" ajouté";document.body.appendChild(t);setTimeout(function(){t.remove();},2200);}\n';

  // Quick view — uses data attributes, no escaping issues
  html += 'var qvC={};\n';
  html += 'function openQV(el){var id=el.getAttribute("data-id");var name=el.getAttribute("data-name");var price=parseFloat(el.getAttribute("data-price"));var img=el.getAttribute("data-img");var desc=el.getAttribute("data-desc");var cat=el.getAttribute("data-cat");qvC={id:id,name:name,price:price,img:img};\n';
  html += '  document.getElementById("qv-vnd").textContent=cat||"Produit";\n';
  html += '  document.getElementById("qv-ttl").textContent=name;\n';
  html += '  document.getElementById("qv-px").textContent=Number(price).toLocaleString("fr-FR")+" "+CUR;\n';
  html += '  document.getElementById("qv-dsc").textContent=desc||"";\n';
  html += '  var media=document.getElementById("qv-media");var ph=document.getElementById("qv-ph");\n';
  html += '  var old=media.querySelector("img");if(old)old.remove();\n';
  html += '  if(img){ph.style.display="none";var im=document.createElement("img");im.src=img;im.alt=name;im.style.cssText="position:absolute;inset:0;width:100%;height:100%;object-fit:cover";media.appendChild(im);}else{ph.style.display="flex";ph.textContent=name.charAt(0).toUpperCase();}\n';
  html += '  document.getElementById("qv-add-btn").onclick=function(){addToCart(qvC.id,qvC.name,qvC.price,qvC.img);closeQV();};\n';
  html += '  document.getElementById("qv-ov").classList.add("open");\n';
  html += '}\n';
  html += 'function closeQV(){document.getElementById("qv-ov").classList.remove("open");}\n';

  // Checkout
  html += 'function openCheckout(){\n';
  html += '  var its=Object.entries(cart);if(!its.length)return;\n';
  html += '  var tot=its.reduce(function(s,e){return s+e[1].price*e[1].qty;},0);\n';
  html += '  var sumHTML="";\n';
  html += '  its.forEach(function(e){sumHTML+=\'<div class="co-si"><span>\'+e[1].name+" × "+e[1].qty+\'</span><span>\'+(e[1].price*e[1].qty).toLocaleString("fr-FR")+" "+CUR+"</span></div>";});\n';
  html += '  sumHTML+=\'<div class="co-si total"><span>Total</span><span>\'+tot.toLocaleString("fr-FR")+" "+CUR+"</span></div>";\n';
  html += '  var body=document.getElementById("co-body");\n';
  html += '  body.innerHTML=\'<div class="co-sum">\'+sumHTML+\'</div>\';\n';
  html += '  body.innerHTML+=\'<p class="co-stl">Vos coordonnées</p>\';\n';
  html += '  body.innerHTML+=\'<div class="co-fi"><label>Nom complet *</label><input id="co-name" type="text" placeholder="Ex: Akosua Mensah"></div>\';\n';
  html += '  body.innerHTML+=\'<div class="co-fi"><label>Téléphone / WhatsApp *</label><input id="co-ph" type="tel" placeholder="Ex: 22890000000"></div>\';\n';
  html += '  body.innerHTML+=\'<div class="co-fi"><label>Adresse de livraison *</label><textarea id="co-addr" placeholder="Quartier, rue, point de repère..."></textarea></div>\';\n';
  html += '  body.innerHTML+=\'<div class="co-fi"><label>Mode de paiement</label><select id="co-pay"><option value="mobile_money">📱 Mobile Money (MTN, Moov, Wave)</option><option value="cash">💵 Paiement à la livraison</option><option value="orange_money">🟠 Orange Money</option></select></div>\';\n';
  html += '  body.innerHTML+=\'<button class="btn-order" id="co-btn" onclick="submitOrder()">✓ Confirmer la commande</button>\';\n';
  html += '  toggleCart();\n';
  html += '  document.getElementById("co-ov").classList.add("open");\n';
  html += '}\n';
  html += 'function closeCO(){document.getElementById("co-ov").classList.remove("open");}\n';
  html += 'async function submitOrder(){\n';
  html += '  var name=document.getElementById("co-name").value.trim();\n';
  html += '  var ph=document.getElementById("co-ph").value.trim();\n';
  html += '  var addr=document.getElementById("co-addr").value.trim();\n';
  html += '  var pay=document.getElementById("co-pay").value;\n';
  html += '  if(!name||!ph||!addr){alert("Remplissez tous les champs obligatoires (*)");return;}\n';
  html += '  var btn=document.getElementById("co-btn");btn.disabled=true;btn.textContent="⏳ Envoi...";\n';
  html += '  var items=Object.entries(cart).map(function(e){return{productId:e[0],quantity:e[1].qty};});\n';
  html += '  try{\n';
  html += '    var r=await fetch("/boutique/"+SLUG+"/order",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({customerName:name,customerPhone:ph,address:addr,items:items,paymentMethod:pay})});\n';
  html += '    var d=await r.json();\n';
  html += '    if(d.success){\n';
  html += '      cart={};updateCartUI();\n';
  html += '      document.getElementById("co-body").innerHTML=\'<div class="co-ok-box"><div class="co-ok">🎉</div><h4>Commande confirmée !</h4><div class="co-num">N° \'+d.orderNumber+\'</div><p>Le commerçant vous contactera bientôt.<br>Merci de votre confiance !</p><button onclick="closeCO()" style="margin-top:18px;background:var(--p);color:white;border:none;padding:11px 26px;border-radius:8px;font-weight:700;cursor:pointer;font-family:inherit">Fermer</button></div>\';\n';
  html += '    }else{btn.disabled=false;btn.textContent="Confirmer la commande";alert(d.error||"Erreur");}\n';
  html += '  }catch(e){btn.disabled=false;btn.textContent="Confirmer la commande";alert("Erreur de connexion.");}\n';
  html += '}\n';

  // Filter
  html += 'function filterCat(cat,btn){document.querySelectorAll(".ftab").forEach(function(b){b.classList.remove("active");});btn.classList.add("active");document.querySelectorAll(".product-card").forEach(function(c){c.style.display=(cat==="all"||c.getAttribute("data-cat")===cat)?"":"none";});}\n';

  // Theme
  html += 'function changeTheme(t){\n';
  html += '  document.querySelectorAll(".tdot").forEach(function(d){d.classList.remove("active");});\n';
  html += '  event.target.classList.add("active");\n';
  html += '  document.getElementById("tpan").classList.remove("open");\n';
  html += '  var lbl=document.getElementById("theme-lbl");\n';
  html += '  var labels={"mode":"👗 Mode","food":"🍽️ Alimentation","beaute":"💄 Beauté","tech":"📱 High-Tech","epicerie":"🛒 Épicerie","artisanat":"🏺 Artisanat","sante":"💊 Santé","bijoux":"💍 Bijoux","sport":"⚽ Sport","maison":"🏠 Maison","bebe":"👶 Bébé","services":"🔧 Services","orange":"🏪 Général"};\n';
  html += '  if(lbl)lbl.textContent=labels[t]||t;\n';
  html += '  fetch("/boutique/"+SLUG+"/theme",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({theme:t,merchantId:MID})}).then(function(){location.reload();}).catch(function(){});\n';
  html += '}\n';

  // Banner
  html += '(function(){\n';
  html += '  fetch("/api/announcements/active").then(function(r){if(!r.ok)return null;return r.json();}).then(function(ann){\n';
  html += '    if(!ann)return;\n';
  html += '    if(sessionStorage.getItem("ann_"+ann.id))return;\n';
  html += '    var C={info:{bg:"#1e3a5f",c:"#93c5fd",i:"ℹ️"},update:{bg:"#064e3b",c:"#6ee7b7",i:"🚀"},promo:{bg:"#78350f",c:"#fcd34d",i:"🎁"},warning:{bg:"#7f1d1d",c:"#fca5a5",i:"⚠️"}};\n';
  html += '    var col=C[ann.type]||C.info;\n';
  html += '    var b=document.getElementById("ann-banner");\n';
  html += '    b.style.background=col.bg;b.style.color=col.c;\n';
  html += '    document.getElementById("ann-ic").textContent=col.i;\n';
  html += '    var te=document.getElementById("ann-txt");var txt=ann.title+" — "+ann.message;te.textContent=txt;\n';
  html += '    if(txt.length>80)te.classList.add("scroll");\n';
  html += '    b.dataset.annId=ann.id;b.classList.add("show");\n';
  html += '    document.body.style.paddingTop=(b.offsetHeight+4)+"px";\n';
  html += '  }).catch(function(){});\n';
  html += '})();\n';
  html += 'function closeBanner(){var b=document.getElementById("ann-banner");if(!b)return;b.style.display="none";document.body.style.paddingTop="";try{if(b.dataset.annId)sessionStorage.setItem("ann_"+b.dataset.annId,"1");}catch(e){}}\n';

  // Bot
  html += 'var chatO=false,chatS=false;\n';
  html += 'function toggleChat(){\n';
  html += '  chatO=!chatO;\n';
  html += '  document.getElementById("chat-box").classList.toggle("open",chatO);\n';
  html += '  document.getElementById("ch-icon").innerHTML=chatO?\'<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>\':\'<svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>\';\n';
  html += '  document.getElementById("ch-notif").style.display="none";\n';
  html += '  if(chatO&&!chatS){chatS=true;setTimeout(function(){addBotMsg("Bonjour ! 👋 Je suis l\'assistant de ' + shopName.replace(/"/g,'&quot;') + '. Comment puis-je vous aider ?");},300);}\n';
  html += '}\n';
  html += 'function addBotMsg(t){var e=document.createElement("div");e.className="cm bot";e.innerHTML=t.replace(/\\n/g,"<br>").replace(/\\*(.*?)\\*/g,"<strong>$1</strong>");document.getElementById("chat-msgs").appendChild(e);scM();}\n';
  html += 'function addUserMsg(t){var e=document.createElement("div");e.className="cm user";e.textContent=t;document.getElementById("chat-msgs").appendChild(e);scM();}\n';
  html += 'function showTyp(){var e=document.createElement("div");e.className="cm bot typing-cm";e.id="typ";e.innerHTML="<span></span><span></span><span></span>";document.getElementById("chat-msgs").appendChild(e);scM();}\n';
  html += 'function rmTyp(){var t=document.getElementById("typ");if(t)t.remove();}\n';
  html += 'function scM(){var m=document.getElementById("chat-msgs");m.scrollTop=m.scrollHeight;}\n';
  html += 'async function sendBotMsg(){\n';
  html += '  var inp=document.getElementById("ch-inp");var t=inp.value.trim();if(!t)return;\n';
  html += '  inp.value="";addUserMsg(t);showTyp();\n';
  html += '  try{\n';
  html += '    var r=await fetch("/boutique/"+SLUG+"/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:t})});\n';
  html += '    var d=await r.json();rmTyp();\n';
  html += '    setTimeout(function(){addBotMsg(d.reply||"Pouvez-vous reformuler ?");},120);\n';
  html += '  }catch(e){rmTyp();addBotMsg("Désolé, problème technique. Contactez-nous sur WhatsApp !");}\n';
  html += '}\n';
  html += 'function sendQuick(q){document.getElementById("ch-inp").value=q;sendBotMsg();}\n';
  html += 'setTimeout(function(){if(!chatO)document.getElementById("ch-notif").style.display="flex";},3500);\n';
  html += '</script>\n</body>\n</html>';

  return html;
};

module.exports = router;