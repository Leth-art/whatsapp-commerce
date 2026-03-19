/**
 * boutique.js — Mini-sites Shopify-style pour les commerçants WaziBot
 */

const express = require("express");
const router = express.Router();
const { Merchant, Product } = require("../models/index");

const THEMES = {
  orange: { primary: "#E85C0E", dark: "#C44D0B", light: "#FEF0E8", bg: "#fff", surface: "#f6f6f7", text: "#1a1a1a", muted: "#6d7175" },
  green:  { primary: "#008060", dark: "#006048", light: "#E3F5F0", bg: "#fff", surface: "#f4f9f7", text: "#1a1a1a", muted: "#6d7175" },
  purple: { primary: "#5c4db1", dark: "#4a3d92", light: "#EEF0FF", bg: "#fff", surface: "#f7f6fb", text: "#1a1a1a", muted: "#6d7175" },
  blue:   { primary: "#0061c2", dark: "#004fa3", light: "#E8F1FF", bg: "#fff", surface: "#f6f8fb", text: "#1a1a1a", muted: "#6d7175" },
  red:    { primary: "#c0392b", dark: "#a93226", light: "#FDEEEC", bg: "#fff", surface: "#fdf6f6", text: "#1a1a1a", muted: "#6d7175" },
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
  const description = merchant.businessDescription || `Bienvenue chez ${shopName}`;
  const city = merchant.city || "";
  const currency = merchant.currency || "XOF";
  const cats = [...new Set(products.map(p => p.category || "Divers"))];

  const productsHTML = products.length === 0
    ? `<div class="empty-state"><div style="font-size:48px;margin-bottom:12px">📦</div><p>Catalogue en cours de préparation...</p></div>`
    : products.map(p => `
      <div class="product-card" data-cat="${p.category||'Divers'}">
        <div class="product-media" onclick="openQV('${p.id}','${p.name.replace(/'/g,"\\'")}',${p.price},'${p.imageUrl||""}','${(p.description||"").slice(0,120).replace(/'/g,"\\'")}','${p.category||""}')">
          ${p.imageUrl ? `<img src="${p.imageUrl}" alt="${p.name}" loading="lazy">` : `<div class="product-placeholder">${p.name.charAt(0).toUpperCase()}</div>`}
          <div class="quick-view-hint">Aperçu rapide</div>
        </div>
        <div class="product-info">
          <div class="product-vendor">${p.category||"Produit"}</div>
          <h3 class="product-title">${p.name}</h3>
          ${p.description?`<p class="product-desc">${p.description.slice(0,70)}${p.description.length>70?"…":""}</p>`:""}
          <div class="product-bottom">
            <div class="product-price">${Number(p.price).toLocaleString("fr-FR")}<span class="price-unit"> ${currency}</span></div>
            <button class="btn-add" onclick="event.stopPropagation();addToCart('${p.id}','${p.name.replace(/'/g,"\\'")}',${p.price},'${p.imageUrl||""}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Ajouter
            </button>
          </div>
        </div>
      </div>`).join("");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${shopName}</title>
<meta name="description" content="${description}">
<meta property="og:title" content="${shopName}"><meta property="og:description" content="${description}">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{
  --p:${theme.primary};--pd:${theme.dark};--pl:${theme.light};
  --bg:${theme.bg};--sf:${theme.surface};--tx:${theme.text};--mt:${theme.muted};
  --bd:#e1e3e5;--r:8px;--sh:0 1px 4px rgba(0,0,0,.08),0 4px 16px rgba(0,0,0,.04);--shh:0 4px 20px rgba(0,0,0,.13);
}
*{margin:0;padding:0;box-sizing:border-box}html{scroll-behavior:smooth}
body{font-family:'Plus Jakarta Sans',sans-serif;background:var(--bg);color:var(--tx);min-height:100vh;-webkit-font-smoothing:antialiased}
/* ANN BANNER */
.ann-banner{position:fixed;top:0;left:0;right:0;z-index:9999;padding:9px 16px;display:none;align-items:center;gap:10px;font-size:13px;font-weight:600}
.ann-banner.show{display:flex}
.ann-banner-text{flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.ann-banner-text.scroll{animation:scrollTxt 20s linear infinite;display:inline-block}
@keyframes scrollTxt{0%{transform:translateX(80%)}100%{transform:translateX(-100%)}}
.ann-x{background:none;border:none;cursor:pointer;font-size:18px;opacity:.7}
/* TOPBAR */
.topbar{background:var(--tx);color:rgba(255,255,255,.8);text-align:center;padding:8px 16px;font-size:12px;font-weight:500;letter-spacing:.2px}
/* HEADER */
.hdr{background:white;border-bottom:1px solid var(--bd);position:sticky;top:0;z-index:100;box-shadow:0 1px 0 var(--bd)}
.hdr-in{max-width:1280px;margin:0 auto;padding:0 24px;height:64px;display:flex;align-items:center;justify-content:space-between;gap:16px}
.logo{font-size:21px;font-weight:800;color:var(--tx);text-decoration:none;letter-spacing:-.4px}
.logo span{color:var(--p)}
.hdr-loc{font-size:11px;color:var(--mt);display:flex;align-items:center;gap:3px;margin-top:2px}
.hdr-actions{display:flex;align-items:center;gap:8px}
.btn-wa{background:var(--p);color:white;border:none;padding:9px 18px;border-radius:var(--r);font-size:13px;font-weight:600;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:6px;transition:.15s;font-family:inherit}
.btn-wa:hover{background:var(--pd);transform:translateY(-1px)}
.cart-icon-btn{position:relative;background:var(--sf);border:1px solid var(--bd);width:40px;height:40px;border-radius:var(--r);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:.15s;color:var(--tx)}
.cart-icon-btn:hover{border-color:var(--p);color:var(--p)}
.cart-pill{position:absolute;top:-7px;right:-7px;background:var(--p);color:white;width:18px;height:18px;border-radius:50%;font-size:10px;font-weight:700;display:none;align-items:center;justify-content:center;border:2px solid white}
.cart-pill.show{display:flex}
/* HERO */
.hero{background:var(--sf);border-bottom:1px solid var(--bd);padding:52px 24px}
.hero-in{max-width:1280px;margin:0 auto;display:grid;grid-template-columns:1fr 420px;gap:48px;align-items:center}
.hero-badge{display:inline-flex;align-items:center;gap:6px;background:var(--pl);color:var(--p);font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;padding:5px 12px;border-radius:20px;margin-bottom:16px}
.hero h1{font-size:clamp(26px,4vw,44px);font-weight:800;line-height:1.15;margin-bottom:12px;letter-spacing:-.5px}
.hero h1 em{font-style:normal;color:var(--p)}
.hero p{color:var(--mt);font-size:15px;line-height:1.7;margin-bottom:28px;max-width:400px}
.hero-cta{display:flex;gap:10px;flex-wrap:wrap}
.btn-hp{background:var(--p);color:white;border:none;padding:13px 26px;border-radius:var(--r);font-size:14px;font-weight:700;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:7px;transition:.15s;font-family:inherit}
.btn-hp:hover{background:var(--pd);transform:translateY(-1px);box-shadow:0 4px 12px rgba(0,0,0,.15)}
.btn-hs{background:white;color:var(--tx);border:1.5px solid var(--bd);padding:12px 22px;border-radius:var(--r);font-size:14px;font-weight:600;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:7px;transition:.15s;font-family:inherit}
.btn-hs:hover{border-color:var(--p);color:var(--p)}
.hero-vis{background:var(--pl);border-radius:20px;padding:40px 32px;text-align:center;min-height:280px;display:flex;flex-direction:column;align-items:center;justify-content:center}
.hero-vis-emoji{font-size:72px;margin-bottom:16px}
.hero-stats{display:flex;gap:28px;justify-content:center}
.hstat-n{font-size:22px;font-weight:800;color:var(--p)}
.hstat-l{font-size:10px;color:var(--mt);text-transform:uppercase;letter-spacing:.8px;margin-top:2px}
/* FEAT BAND */
.feat-band{background:white;border-bottom:1px solid var(--bd)}
.feat-in{max-width:1280px;margin:0 auto;display:grid;grid-template-columns:repeat(3,1fr)}
.feat-item{display:flex;align-items:center;gap:12px;padding:20px 24px;border-right:1px solid var(--bd)}
.feat-item:last-child{border-right:none}
.feat-icon{font-size:20px;flex-shrink:0}
.feat-ttl{font-size:13px;font-weight:700}
.feat-sub{font-size:12px;color:var(--mt);margin-top:1px}
/* CATALOGUE */
.cat-section{max-width:1280px;margin:0 auto;padding:48px 24px}
.cat-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;gap:16px;flex-wrap:wrap}
.cat-ttl{font-size:20px;font-weight:800;letter-spacing:-.3px}
.cat-cnt{font-size:13px;color:var(--mt);margin-top:3px}
.filter-tabs{display:flex;gap:6px;flex-wrap:wrap}
.ftab{padding:7px 15px;border-radius:20px;font-size:12px;font-weight:600;border:1.5px solid var(--bd);background:transparent;color:var(--mt);cursor:pointer;transition:.15s;font-family:inherit}
.ftab:hover{border-color:var(--p);color:var(--p)}
.ftab.active{background:var(--p);color:white;border-color:var(--p)}
/* PRODUCTS */
.pgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(225px,1fr));gap:20px}
.product-card{background:white;border:1px solid var(--bd);border-radius:12px;overflow:hidden;transition:.2s;cursor:pointer}
.product-card:hover{box-shadow:var(--shh);transform:translateY(-2px);border-color:transparent}
.product-media{position:relative;padding-top:100%;overflow:hidden;background:var(--sf)}
.product-media img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform .4s}
.product-card:hover .product-media img{transform:scale(1.05)}
.product-placeholder{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:52px;font-weight:800;color:var(--p);background:var(--pl)}
.quick-view-hint{position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,.65);color:white;font-size:11px;font-weight:600;text-align:center;padding:8px;opacity:0;transition:.2s;letter-spacing:.3px}
.product-card:hover .quick-view-hint{opacity:1}
.product-info{padding:12px 14px 14px}
.product-vendor{font-size:10px;color:var(--mt);text-transform:uppercase;letter-spacing:1px;margin-bottom:3px;font-weight:500}
.product-title{font-size:14px;font-weight:700;margin-bottom:3px;line-height:1.3;color:var(--tx)}
.product-desc{font-size:11px;color:var(--mt);line-height:1.5;margin-bottom:8px}
.product-bottom{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:8px}
.product-price{font-size:16px;font-weight:800;color:var(--tx)}
.price-unit{font-size:10px;font-weight:500;color:var(--mt)}
.btn-add{background:var(--p);color:white;border:none;padding:8px 12px;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:4px;transition:.15s;font-family:inherit;white-space:nowrap;flex-shrink:0}
.btn-add:hover{background:var(--pd)}
.btn-add:active{transform:scale(.96)}
.empty-state{text-align:center;padding:72px 24px;color:var(--mt)}
/* FOOTER */
.ftr{background:#1a1a1a;color:rgba(255,255,255,.7);padding:40px 24px 28px;margin-top:56px}
.ftr-in{max-width:1280px;margin:0 auto}
.ftr-top{display:flex;gap:40px;margin-bottom:32px;flex-wrap:wrap;justify-content:space-between}
.ftr-brand h3{font-size:18px;font-weight:800;color:white;margin-bottom:6px}
.ftr-brand p{font-size:13px;line-height:1.6;max-width:260px}
.ftr-lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,.4);margin-bottom:10px}
.ftr-links a{display:block;font-size:13px;color:rgba(255,255,255,.65);text-decoration:none;margin-bottom:7px;transition:.15s}
.ftr-links a:hover{color:white}
.ftr-btm{border-top:1px solid rgba(255,255,255,.08);padding-top:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px}
.ftr-btm p{font-size:12px;color:rgba(255,255,255,.35)}
.ftr-btm a{color:var(--p);text-decoration:none;font-size:12px}
/* CART DRAWER */
.cart-ov{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:500;opacity:0;pointer-events:none;transition:.25s}
.cart-ov.open{opacity:1;pointer-events:all}
.cart-drw{position:fixed;top:0;right:0;bottom:0;width:420px;background:white;z-index:501;transform:translateX(100%);transition:.3s cubic-bezier(.4,0,.2,1);display:flex;flex-direction:column;box-shadow:-8px 0 40px rgba(0,0,0,.12)}
.cart-drw.open{transform:translateX(0)}
.drw-hdr{padding:18px 22px;border-bottom:1px solid var(--bd);display:flex;align-items:center;justify-content:space-between}
.drw-ttl{font-size:16px;font-weight:800}
.drw-close{background:none;border:none;cursor:pointer;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--mt);transition:.15s}
.drw-close:hover{background:var(--sf);color:var(--tx)}
.drw-body{flex:1;overflow-y:auto;padding:18px 22px}
.cart-empty-state{text-align:center;padding:40px 0;color:var(--mt)}
.cart-empty-state p{font-size:14px;margin:12px 0 16px}
.ci{display:flex;gap:14px;padding:14px 0;border-bottom:1px solid var(--bd)}
.ci:last-child{border-bottom:none}
.ci-img{width:68px;height:68px;border-radius:8px;background:var(--sf);flex-shrink:0;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;color:var(--p)}
.ci-img img{width:100%;height:100%;object-fit:cover}
.ci-body{flex:1;min-width:0}
.ci-name{font-size:13px;font-weight:600;margin-bottom:2px}
.ci-price{font-size:13px;color:var(--p);font-weight:700}
.ci-ctrl{display:flex;align-items:center;gap:8px;margin-top:8px}
.qb{width:26px;height:26px;border:1.5px solid var(--bd);background:transparent;border-radius:6px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:14px;transition:.15s}
.qb:hover{border-color:var(--p);color:var(--p)}
.qv{font-size:13px;font-weight:700;min-width:18px;text-align:center}
.ci-rm{background:none;border:none;color:var(--mt);font-size:20px;cursor:pointer;margin-left:auto;line-height:1}
.ci-rm:hover{color:#c0392b}
.drw-ftr{padding:18px 22px;border-top:1px solid var(--bd);background:white}
.drw-sub{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px}
.drw-sub-lbl{font-size:13px;color:var(--mt)}
.drw-sub-amt{font-size:20px;font-weight:800}
.drw-note{font-size:11px;color:var(--mt);margin-bottom:14px}
.btn-checkout{width:100%;background:var(--p);color:white;border:none;padding:14px;border-radius:var(--r);font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;transition:.15s;display:flex;align-items:center;justify-content:center;gap:7px}
.btn-checkout:hover{background:var(--pd)}
.btn-cont{width:100%;background:transparent;color:var(--mt);border:none;padding:10px;border-radius:var(--r);font-size:13px;cursor:pointer;font-family:inherit;margin-top:6px;transition:.15s}
.btn-cont:hover{color:var(--tx)}
/* QUICK VIEW */
.qv-ov{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:550;display:none;align-items:center;justify-content:center;padding:20px}
.qv-ov.open{display:flex}
.qv-modal{background:white;border-radius:16px;width:100%;max-width:640px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.2)}
.qv-inner{display:grid;grid-template-columns:1fr 1fr}
.qv-media{background:var(--sf);position:relative;min-height:320px;display:flex;align-items:center;justify-content:center;overflow:hidden}
.qv-media img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.qv-ph{font-size:72px;font-weight:800;color:var(--p)}
.qv-info{padding:28px 22px;display:flex;flex-direction:column}
.qv-vendor{font-size:10px;color:var(--mt);text-transform:uppercase;letter-spacing:1px;margin-bottom:5px}
.qv-ttl{font-size:19px;font-weight:800;margin-bottom:6px;letter-spacing:-.3px}
.qv-price{font-size:22px;font-weight:800;color:var(--p);margin-bottom:10px}
.qv-desc{font-size:13px;color:var(--mt);line-height:1.6;margin-bottom:18px;flex:1}
.qv-btns{display:flex;flex-direction:column;gap:8px}
.btn-qv{background:var(--p);color:white;border:none;padding:13px;border-radius:var(--r);font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;transition:.15s;display:flex;align-items:center;justify-content:center;gap:7px}
.btn-qv:hover{background:var(--pd)}
.btn-qvc{background:var(--sf);color:var(--tx);border:1px solid var(--bd);padding:11px;border-radius:var(--r);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:.15s}
.btn-qvc:hover{border-color:var(--p);color:var(--p)}
/* CHECKOUT */
.co-ov{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:600;display:none;align-items:center;justify-content:center;padding:20px}
.co-ov.open{display:flex}
.co-modal{background:white;border-radius:16px;width:100%;max-width:480px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.2)}
.co-hdr{padding:18px 22px;border-bottom:1px solid var(--bd);display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:white;z-index:1}
.co-hdr h3{font-size:16px;font-weight:800}
.co-x{background:none;border:none;cursor:pointer;font-size:20px;color:var(--mt);line-height:1}
.co-body{padding:22px}
.co-stl{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--mt);margin-bottom:12px}
.co-sum{background:var(--sf);border-radius:10px;padding:14px;margin-bottom:20px}
.co-si{display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px;color:var(--mt)}
.co-si:last-child{margin-bottom:0;font-weight:800;font-size:15px;color:var(--p);border-top:1px solid var(--bd);padding-top:8px;margin-top:4px}
.co-fi{margin-bottom:12px}
.co-fi label{display:block;font-size:11px;font-weight:600;color:var(--tx);margin-bottom:4px}
.co-fi input,.co-fi select,.co-fi textarea{width:100%;border:1.5px solid var(--bd);border-radius:var(--r);padding:10px 13px;font-size:14px;font-family:inherit;color:var(--tx);background:white;outline:none;transition:.15s}
.co-fi input:focus,.co-fi select:focus,.co-fi textarea:focus{border-color:var(--p)}
.co-fi textarea{resize:none;min-height:72px}
.btn-order{width:100%;background:var(--p);color:white;border:none;padding:14px;border-radius:var(--r);font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;transition:.15s;display:flex;align-items:center;justify-content:center;gap:7px}
.btn-order:hover{background:var(--pd)}
.btn-order:disabled{opacity:.6;cursor:not-allowed}
.co-success{text-align:center;padding:32px 20px}
.co-ok{width:68px;height:68px;background:#d4edda;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:30px;margin:0 auto 14px}
.co-success h4{font-size:17px;font-weight:800;margin-bottom:6px}
.co-success p{color:var(--mt);font-size:13px;line-height:1.6}
.co-num{background:var(--pl);color:var(--p);font-weight:700;padding:4px 12px;border-radius:20px;font-size:12px;display:inline-block;margin:6px 0}
/* CHAT */
.chat-w{position:fixed;bottom:24px;right:24px;z-index:400}
.chat-tog{width:54px;height:54px;border-radius:50%;border:none;background:var(--p);color:white;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.18);transition:.2s;display:flex;align-items:center;justify-content:center;position:relative}
.chat-tog:hover{transform:scale(1.08)}
.chat-notif{position:absolute;top:-4px;right:-4px;width:17px;height:17px;background:#e74c3c;border-radius:50%;font-size:9px;font-weight:700;color:white;display:none;align-items:center;justify-content:center;border:2px solid white}
.chat-box{position:absolute;bottom:66px;right:0;width:336px;background:white;border-radius:16px;overflow:hidden;display:none;box-shadow:0 8px 40px rgba(0,0,0,.14);border:1px solid var(--bd)}
.chat-box.open{display:flex;flex-direction:column}
@keyframes su{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
.chat-box.open{animation:su .2s ease}
.chat-hdr{background:var(--p);padding:13px 15px;display:flex;align-items:center;justify-content:space-between}
.ch-info{display:flex;align-items:center;gap:9px}
.ch-av{width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:15px}
.ch-name{font-weight:700;font-size:13px;color:white}
.ch-st{font-size:10px;color:rgba(255,255,255,.75)}
.ch-xbtn{background:none;border:none;color:rgba(255,255,255,.8);font-size:17px;cursor:pointer}
.chat-msgs{padding:13px;height:254px;overflow-y:auto;display:flex;flex-direction:column;gap:8px}
.chat-msgs::-webkit-scrollbar{width:3px}
.chat-msgs::-webkit-scrollbar-thumb{background:var(--bd);border-radius:3px}
.cm{max-width:86%;padding:8px 12px;border-radius:12px;font-size:13px;line-height:1.5}
.cm.bot{background:var(--sf);color:var(--tx);border-radius:4px 12px 12px 12px;align-self:flex-start}
.cm.user{background:var(--p);color:white;border-radius:12px 4px 12px 12px;align-self:flex-end}
.typing-cm{display:flex;gap:4px;align-items:center;padding:9px 12px !important}
.typing-cm span{width:6px;height:6px;background:var(--mt);border-radius:50%;animation:bn 1.2s infinite}
.typing-cm span:nth-child(2){animation-delay:.2s}.typing-cm span:nth-child(3){animation-delay:.4s}
@keyframes bn{0%,80%,100%{transform:scale(.8);opacity:.5}40%{transform:scale(1.2);opacity:1}}
.chat-qks{padding:7px 10px;display:flex;gap:5px;flex-wrap:wrap;border-top:1px solid var(--bd)}
.qk-btn{padding:4px 9px;border-radius:20px;border:1.5px solid var(--bd);background:transparent;color:var(--mt);font-size:11px;cursor:pointer;transition:.15s;font-family:inherit}
.qk-btn:hover{border-color:var(--p);color:var(--p)}
.chat-inp-w{padding:9px;border-top:1px solid var(--bd);display:flex;gap:7px}
.ch-inp{flex:1;background:var(--sf);border:1.5px solid var(--bd);color:var(--tx);padding:8px 12px;border-radius:20px;font-size:13px;font-family:inherit;outline:none;transition:.15s}
.ch-inp:focus{border-color:var(--p)}
.ch-snd{width:32px;height:32px;border-radius:50%;background:var(--p);border:none;color:white;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:.15s;flex-shrink:0}
.ch-snd:hover{background:var(--pd)}
/* THEME */
.theme-sw{position:fixed;bottom:90px;left:22px;z-index:300}
.theme-tog-btn{width:38px;height:38px;border-radius:50%;border:1.5px solid var(--bd);background:white;cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.08);transition:.15s}
.theme-tog-btn:hover{transform:scale(1.08)}
.theme-pan{position:absolute;bottom:46px;left:0;background:white;border:1px solid var(--bd);border-radius:12px;padding:12px;display:none;box-shadow:0 8px 24px rgba(0,0,0,.1);min-width:150px}
.theme-pan.open{display:block}
.theme-pan-lbl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--mt);margin-bottom:9px}
.tdots{display:flex;gap:7px;flex-wrap:wrap}
.tdot{width:28px;height:28px;border-radius:50%;cursor:pointer;border:3px solid transparent;transition:.2s}
.tdot:hover,.tdot.active{border-color:#1a1a1a;transform:scale(1.1)}
/* WA FLOAT */
.wa-float{display:none;position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:#25D366;color:white;text-decoration:none;padding:11px 22px;border-radius:30px;font-weight:700;font-size:13px;box-shadow:0 4px 14px rgba(37,211,102,.4);z-index:299;align-items:center;gap:7px;white-space:nowrap}
/* RESPONSIVE */
@media(max-width:900px){.hero-in{grid-template-columns:1fr}.hero-vis{display:none}.feat-in{grid-template-columns:1fr;gap:0}.feat-item{border-right:none;border-bottom:1px solid var(--bd);padding:14px 16px}.feat-item:last-child{border-bottom:none}.cart-drw{width:100%}.qv-inner{grid-template-columns:1fr}.qv-media{min-height:200px}}
@media(max-width:500px){.pgrid{grid-template-columns:repeat(2,1fr);gap:12px}.product-info{padding:9px 11px 11px}.btn-add{padding:7px 9px;font-size:11px}.hero{padding:36px 16px}.cat-section{padding:32px 16px}.hdr-in{padding:0 16px}.chat-w{bottom:80px;right:14px}.chat-box{width:295px;right:-14px}.theme-sw{bottom:80px;left:14px}.wa-float{display:flex}}
</style>
</head>
<body>

<div class="ann-banner" id="ann-banner"><span id="ann-ic">ℹ️</span><span class="ann-banner-text" id="ann-txt"></span><button class="ann-x" onclick="closeBanner()">✕</button></div>

<div class="topbar">🚚 Livraison disponible${city?` à ${city} et environs`:""}  ·  📱 Paiement Mobile Money accepté</div>

<header class="hdr"><div class="hdr-in">
  <div>
    <a href="#" class="logo">${shopName.split(' ').map((w,i)=>i===0?`<span>${w}</span>`:` ${w}`).join('')}</a>
    ${city?`<div class="hdr-loc"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>${city}</div>`:""}
  </div>
  <div class="hdr-actions">
    ${whatsappNumber?`<a href="https://wa.me/${whatsappNumber}" target="_blank" class="btn-wa">💬 WhatsApp</a>`:""}
    <button class="cart-icon-btn" onclick="toggleCart()">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
      <div class="cart-pill" id="cart-pill">0</div>
    </button>
  </div>
</div></header>

<section class="hero"><div class="hero-in">
  <div>
    <div class="hero-badge">🛍️ Boutique officielle</div>
    <h1>${shopName.split(' ').map((w,i)=>i===0?`<em>${w}</em>`:` ${w}`).join('')}</h1>
    <p>${description}</p>
    <div class="hero-cta">
      <a href="#catalogue" class="btn-hp">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>
        Voir les produits
      </a>
      ${whatsappNumber?`<a href="https://wa.me/${whatsappNumber}" target="_blank" class="btn-hs">💬 Nous contacter</a>`:""}
    </div>
  </div>
  <div class="hero-vis">
    <div class="hero-vis-emoji">🛍️</div>
    <div class="hero-stats">
      <div><div class="hstat-n">${products.length}</div><div class="hstat-l">Produits</div></div>
      <div><div class="hstat-n">24/7</div><div class="hstat-l">Service</div></div>
      <div><div class="hstat-n">⭐</div><div class="hstat-l">Qualité</div></div>
    </div>
  </div>
</div></section>

<div class="feat-band"><div class="feat-in">
  <div class="feat-item"><span class="feat-icon">🚚</span><div><div class="feat-ttl">Livraison rapide</div><div class="feat-sub">Sur place et environs</div></div></div>
  <div class="feat-item"><span class="feat-icon">📱</span><div><div class="feat-ttl">Mobile Money</div><div class="feat-sub">MTN, Moov, Wave, Orange</div></div></div>
  <div class="feat-item"><span class="feat-icon">✅</span><div><div class="feat-ttl">Qualité garantie</div><div class="feat-sub">Satisfaction assurée</div></div></div>
</div></div>

<section class="cat-section" id="catalogue">
  <div class="cat-hdr">
    <div>
      <h2 class="cat-ttl">Notre catalogue</h2>
      <p class="cat-cnt">${products.length} produit${products.length>1?"s":""}</p>
    </div>
    ${cats.length>1?`<div class="filter-tabs"><button class="ftab active" onclick="filterCat('all',this)">Tout</button>${cats.map(c=>`<button class="ftab" onclick="filterCat('${c}',this)">${c}</button>`).join("")}</div>`:""}
  </div>
  <div class="pgrid" id="products-grid">${productsHTML}</div>
</section>

<footer class="ftr"><div class="ftr-in">
  <div class="ftr-top">
    <div class="ftr-brand">
      <h3>${shopName}</h3><p>${description}</p>
      ${whatsappNumber?`<a href="https://wa.me/${whatsappNumber}" target="_blank" style="display:inline-flex;align-items:center;gap:6px;margin-top:12px;background:#25D366;color:white;padding:8px 16px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600">💬 WhatsApp</a>`:""}
    </div>
    <div>
      <div class="ftr-lbl">Liens utiles</div>
      <div class="ftr-links">
        <a href="#catalogue">Nos produits</a>
        ${whatsappNumber?`<a href="https://wa.me/${whatsappNumber}" target="_blank">Nous contacter</a>`:""}
      </div>
    </div>
  </div>
  <div class="ftr-btm">
    <p>© ${new Date().getFullYear()} ${shopName}${city?` · ${city}`:""}</p>
    <a href="/merchant?id=${merchant.id}">Espace commerçant</a>
  </div>
</div></footer>

${whatsappNumber?`<a href="https://wa.me/${whatsappNumber}" target="_blank" class="wa-float">💬 Commander sur WhatsApp</a>`:""}

<!-- CART DRAWER -->
<div class="cart-ov" id="cart-ov" onclick="toggleCart()"></div>
<div class="cart-drw" id="cart-drw">
  <div class="drw-hdr">
    <div class="drw-ttl">Mon panier (<span id="drw-cnt">0</span>)</div>
    <button class="drw-close" onclick="toggleCart()"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
  </div>
  <div class="drw-body" id="drw-body">
    <div class="cart-empty-state"><div style="font-size:44px;margin-bottom:8px">🛒</div><p>Votre panier est vide</p><button onclick="toggleCart()" style="background:var(--p);color:white;border:none;padding:9px 20px;border-radius:8px;font-weight:700;cursor:pointer;font-family:inherit;font-size:13px">Continuer</button></div>
  </div>
  <div class="drw-ftr" id="drw-ftr" style="display:none">
    <div class="drw-sub"><span class="drw-sub-lbl">Sous-total</span><span class="drw-sub-amt" id="drw-amt">0</span></div>
    <p class="drw-note">Livraison calculée à la commande</p>
    <button class="btn-checkout" onclick="openCheckout()">Passer la commande →</button>
    <button class="btn-cont" onclick="toggleCart()">Continuer les achats</button>
  </div>
</div>

<!-- QUICK VIEW -->
<div class="qv-ov" id="qv-ov">
  <div class="qv-modal">
    <div class="qv-inner">
      <div class="qv-media" id="qv-media"><div class="qv-ph" id="qv-ph"></div></div>
      <div class="qv-info">
        <div class="qv-vendor" id="qv-vnd"></div>
        <h3 class="qv-ttl" id="qv-ttl"></h3>
        <div class="qv-price" id="qv-px"></div>
        <p class="qv-desc" id="qv-dsc"></p>
        <div class="qv-btns">
          <button class="btn-qv" onclick="addFromQV()">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Ajouter au panier
          </button>
          <button class="btn-qvc" onclick="closeQV()">Fermer</button>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- CHECKOUT -->
<div class="co-ov" id="co-ov">
  <div class="co-modal">
    <div class="co-hdr"><h3>Finaliser la commande</h3><button class="co-x" onclick="closeCO()">✕</button></div>
    <div class="co-body" id="co-body"></div>
  </div>
</div>

<!-- THEME -->
<div class="theme-sw">
  <div class="theme-pan" id="tpan">
    <div class="theme-pan-lbl">🎨 Thème</div>
    <div class="tdots">
      <div class="tdot ${merchant.siteTheme==='orange'?'active':''}" style="background:#E85C0E" onclick="changeTheme('orange')" title="Orange"></div>
      <div class="tdot ${merchant.siteTheme==='green'?'active':''}" style="background:#008060" onclick="changeTheme('green')" title="Vert"></div>
      <div class="tdot ${merchant.siteTheme==='purple'?'active':''}" style="background:#5c4db1" onclick="changeTheme('purple')" title="Violet"></div>
      <div class="tdot ${merchant.siteTheme==='blue'?'active':''}" style="background:#0061c2" onclick="changeTheme('blue')" title="Bleu"></div>
      <div class="tdot ${merchant.siteTheme==='red'?'active':''}" style="background:#c0392b" onclick="changeTheme('red')" title="Rouge"></div>
    </div>
  </div>
  <button class="theme-tog-btn" onclick="document.getElementById('tpan').classList.toggle('open')">🎨</button>
</div>

<!-- BOT -->
<div class="chat-w">
  <div class="chat-box" id="chat-box">
    <div class="chat-hdr">
      <div class="ch-info">
        <div class="ch-av">🤖</div>
        <div><div class="ch-name">Assistant ${shopName}</div><div class="ch-st">● En ligne · Répond instantanément</div></div>
      </div>
      <button class="ch-xbtn" onclick="toggleChat()">✕</button>
    </div>
    <div class="chat-msgs" id="chat-msgs"></div>
    <div class="chat-qks">
      <button class="qk-btn" onclick="sendQuick('catalogue')">🛍️ Catalogue</button>
      <button class="qk-btn" onclick="sendQuick('livraison')">🚚 Livraison</button>
      <button class="qk-btn" onclick="sendQuick('paiement')">💳 Paiement</button>
      <button class="qk-btn" onclick="sendQuick('contact')">📞 Contact</button>
    </div>
    <div class="chat-inp-w">
      <input class="ch-inp" id="ch-inp" placeholder="Posez votre question..." onkeydown="if(event.key==='Enter')sendBotMsg()">
      <button class="ch-snd" onclick="sendBotMsg()"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>
    </div>
  </div>
  <button class="chat-tog" onclick="toggleChat()">
    <span id="ch-icon"><svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg></span>
    <div class="chat-notif" id="ch-notif">1</div>
  </button>
</div>

<script>
const SLUG='${merchant.shopSlug}';const MID='${merchant.id}';const CUR='${currency}';
let cart={};

// CART
function addToCart(id,name,price,img){
  if(cart[id])cart[id].qty++;else cart[id]={name,price,qty:1,img:img||''};
  updateCartUI();showAddedToast(name);if(!cOpen)openCart();
}
function updateCartUI(){
  const tot=Object.values(cart).reduce((s,i)=>s+i.qty,0);
  const amt=Object.values(cart).reduce((s,i)=>s+i.price*i.qty,0);
  const pill=document.getElementById('cart-pill');
  pill.textContent=tot;pill.classList.toggle('show',tot>0);
  document.getElementById('drw-cnt').textContent=tot;
  document.getElementById('drw-amt').textContent=amt.toLocaleString('fr-FR')+' '+CUR;
  const body=document.getElementById('drw-body');
  const ftr=document.getElementById('drw-ftr');
  if(!tot){
    body.innerHTML='<div class="cart-empty-state"><div style="font-size:44px;margin-bottom:8px">🛒</div><p>Votre panier est vide</p><button onclick="toggleCart()" style="background:var(--p);color:white;border:none;padding:9px 20px;border-radius:8px;font-weight:700;cursor:pointer;font-family:inherit;font-size:13px">Continuer</button></div>';
    ftr.style.display='none';
  }else{
    body.innerHTML=Object.entries(cart).map(([id,it])=>'<div class="ci"><div class="ci-img">'+(it.img?'<img src="'+it.img+'" alt="">':it.name.charAt(0))+'</div><div class="ci-body"><div class="ci-name">'+it.name+'</div><div class="ci-price">'+(it.price*it.qty).toLocaleString('fr-FR')+' '+CUR+'</div><div class="ci-ctrl"><button class="qb" onclick="cqty(\''+id+'\',-1)">−</button><span class="qv">'+it.qty+'</span><button class="qb" onclick="cqty(\''+id+'\',1)">+</button><button class="ci-rm" onclick="removeCI(\''+id+'\')">×</button></div></div></div>').join('');
    ftr.style.display='block';
  }
}
function cqty(id,d){if(!cart[id])return;cart[id].qty+=d;if(cart[id].qty<=0)delete cart[id];updateCartUI();}
function removeCI(id){delete cart[id];updateCartUI();}
let cOpen=false;
function toggleCart(){cOpen=!cOpen;document.getElementById('cart-ov').classList.toggle('open',cOpen);document.getElementById('cart-drw').classList.toggle('open',cOpen);}
function openCart(){cOpen=true;document.getElementById('cart-ov').classList.add('open');document.getElementById('cart-drw').classList.add('open');}
function showAddedToast(n){const t=document.createElement('div');t.style.cssText='position:fixed;top:78px;right:20px;background:#1a1a1a;color:white;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:600;z-index:600;box-shadow:0 4px 12px rgba(0,0,0,.2)';t.textContent='✓ '+n+' ajouté';document.body.appendChild(t);setTimeout(()=>t.remove(),2200);}

// QUICK VIEW
let qvC={};
function openQV(id,name,price,img,desc,cat){
  qvC={id,name,price,img};
  document.getElementById('qv-vnd').textContent=cat||'Produit';
  document.getElementById('qv-ttl').textContent=name;
  document.getElementById('qv-px').textContent=Number(price).toLocaleString('fr-FR')+' '+CUR;
  document.getElementById('qv-dsc').textContent=desc||'';
  const media=document.getElementById('qv-media');
  const ph=document.getElementById('qv-ph');
  const old=media.querySelector('img');if(old)old.remove();
  if(img){ph.style.display='none';const im=document.createElement('img');im.src=img;im.alt=name;im.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:cover';media.appendChild(im);}
  else{ph.style.display='flex';ph.textContent=name.charAt(0).toUpperCase();}
  document.getElementById('qv-ov').classList.add('open');
}
function closeQV(){document.getElementById('qv-ov').classList.remove('open');}
function addFromQV(){addToCart(qvC.id,qvC.name,qvC.price,qvC.img);closeQV();}

// CHECKOUT
function openCheckout(){
  const its=Object.entries(cart);if(!its.length)return;
  const tot=its.reduce((s,[,i])=>s+i.price*i.qty,0);
  document.getElementById('co-body').innerHTML=
    '<div class="co-sum">'+its.map(([,i])=>'<div class="co-si"><span>'+i.name+' × '+i.qty+'</span><span>'+(i.price*i.qty).toLocaleString('fr-FR')+' '+CUR+'</span></div>').join('')+'<div class="co-si"><span>Total</span><span>'+tot.toLocaleString('fr-FR')+' '+CUR+'</span></div></div>'+
    '<p class="co-stl">Vos coordonnées</p>'+
    '<div class="co-fi"><label>Nom complet *</label><input id="co-name" type="text" placeholder="Ex: Akosua Mensah"></div>'+
    '<div class="co-fi"><label>Téléphone / WhatsApp *</label><input id="co-ph" type="tel" placeholder="Ex: 22890000000"></div>'+
    '<div class="co-fi"><label>Adresse de livraison *</label><textarea id="co-addr" placeholder="Quartier, rue, point de repère..."></textarea></div>'+
    '<div class="co-fi"><label>Mode de paiement</label><select id="co-pay"><option value="mobile_money">📱 Mobile Money (MTN, Moov, Wave)</option><option value="cash">💵 Paiement à la livraison</option><option value="orange_money">🟠 Orange Money</option></select></div>'+
    '<button class="btn-order" id="co-btn" onclick="submitOrder()">✓ Confirmer la commande</button>';
  toggleCart();
  document.getElementById('co-ov').classList.add('open');
}
function closeCO(){document.getElementById('co-ov').classList.remove('open');}
async function submitOrder(){
  const name=document.getElementById('co-name')?.value.trim();
  const ph=document.getElementById('co-ph')?.value.trim();
  const addr=document.getElementById('co-addr')?.value.trim();
  const pay=document.getElementById('co-pay')?.value;
  if(!name||!ph||!addr){alert('Remplissez tous les champs obligatoires (*)');return;}
  const btn=document.getElementById('co-btn');btn.disabled=true;btn.textContent='⏳ Envoi...';
  const items=Object.entries(cart).map(([productId,i])=>({productId,quantity:i.qty}));
  try{
    const r=await fetch('/boutique/'+SLUG+'/order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({customerName:name,customerPhone:ph,address:addr,items,paymentMethod:pay})});
    const d=await r.json();
    if(d.success){
      cart={};updateCartUI();
      document.getElementById('co-body').innerHTML='<div class="co-success"><div class="co-ok">🎉</div><h4>Commande confirmée !</h4><div class="co-num">N° '+d.orderNumber+'</div><p>Le commerçant vous contactera bientôt.<br>Merci de votre confiance !</p><button onclick="closeCO()" style="margin-top:18px;background:var(--p);color:white;border:none;padding:11px 26px;border-radius:8px;font-weight:700;cursor:pointer;font-family:inherit">Fermer</button></div>';
    }else{btn.disabled=false;btn.textContent='Confirmer la commande';alert(d.error||'Erreur');}
  }catch{btn.disabled=false;btn.textContent='Confirmer la commande';alert('Erreur de connexion.');}
}

// FILTER
function filterCat(cat,btn){
  document.querySelectorAll('.ftab').forEach(b=>b.classList.remove('active'));btn.classList.add('active');
  document.querySelectorAll('.product-card').forEach(c=>{c.style.display=(cat==='all'||c.dataset.cat===cat)?'':'none';});
}

// THEME
async function changeTheme(t){
  document.querySelectorAll('.tdot').forEach(d=>d.classList.remove('active'));event.target.classList.add('active');
  document.getElementById('tpan').classList.remove('open');
  try{await fetch('/boutique/'+SLUG+'/theme',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({theme:t,merchantId:MID})});location.reload();}catch{}
}

// BANNER
(async()=>{
  try{
    const r=await fetch('/api/announcements/active');if(!r.ok)return;
    const ann=await r.json();if(!ann)return;
    if(sessionStorage.getItem('ann_'+ann.id))return;
    const C={info:{bg:'#1e3a5f',c:'#93c5fd',i:'ℹ️'},update:{bg:'#064e3b',c:'#6ee7b7',i:'🚀'},promo:{bg:'#78350f',c:'#fcd34d',i:'🎁'},warning:{bg:'#7f1d1d',c:'#fca5a5',i:'⚠️'}};
    const col=C[ann.type]||C.info;
    const b=document.getElementById('ann-banner');
    b.style.background=col.bg;b.style.color=col.c;
    document.getElementById('ann-ic').textContent=col.i;
    const te=document.getElementById('ann-txt');
    const txt=ann.title+' — '+ann.message;te.textContent=txt;
    if(txt.length>80)te.classList.add('scroll');
    b.dataset.annId=ann.id;b.classList.add('show');
    const h=b.offsetHeight;document.body.style.paddingTop=(h+4)+'px';
  }catch{}
})();
function closeBanner(){
  const b=document.getElementById('ann-banner');if(!b)return;
  b.style.display='none';document.body.style.paddingTop='';
  try{if(b.dataset.annId)sessionStorage.setItem('ann_'+b.dataset.annId,'1');}catch{}
}

// BOT
let chatO=false,chatS=false;
function toggleChat(){
  chatO=!chatO;
  document.getElementById('chat-box').classList.toggle('open',chatO);
  document.getElementById('ch-icon').innerHTML=chatO?'<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>':'<svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>';
  document.getElementById('ch-notif').style.display='none';
  if(chatO&&!chatS){chatS=true;setTimeout(()=>addBotMsg('Bonjour ! 👋 Je suis l\'assistant de *${shopName}*. Comment puis-je vous aider ?'),300);}
}
function addBotMsg(t){const e=document.createElement('div');e.className='cm bot';e.innerHTML=t.replace(/\n/g,'<br>').replace(/\*(.*?)\*/g,'<strong>$1</strong>');document.getElementById('chat-msgs').appendChild(e);scM();}
function addUserMsg(t){const e=document.createElement('div');e.className='cm user';e.textContent=t;document.getElementById('chat-msgs').appendChild(e);scM();}
function showTyp(){const e=document.createElement('div');e.className='cm bot typing-cm';e.id='typ';e.innerHTML='<span></span><span></span><span></span>';document.getElementById('chat-msgs').appendChild(e);scM();}
function rmTyp(){document.getElementById('typ')?.remove();}
function scM(){const m=document.getElementById('chat-msgs');m.scrollTop=m.scrollHeight;}
async function sendBotMsg(){
  const inp=document.getElementById('ch-inp');const t=inp.value.trim();if(!t)return;
  inp.value='';addUserMsg(t);showTyp();
  try{const r=await fetch('/boutique/'+SLUG+'/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:t})});
    const d=await r.json();rmTyp();setTimeout(()=>addBotMsg(d.reply||'Pouvez-vous reformuler ?'),120);
  }catch{rmTyp();addBotMsg('Désolé, problème. Contactez-nous sur WhatsApp !');}
}
function sendQuick(q){document.getElementById('ch-inp').value=q;sendBotMsg();}
setTimeout(()=>{if(!chatO)document.getElementById('ch-notif').style.display='flex';},3500);
</script>
</body>
</html>`;
};

module.exports = router;