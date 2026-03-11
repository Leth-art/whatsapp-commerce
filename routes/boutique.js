/**
 * boutique.js — Route pour les mini-sites automatiques des commerçants
 * GET /boutique/:slug — Affiche le site public du commerçant
 * PATCH /boutique/:slug/theme — Change le thème (depuis dashboard)
 */

const express = require("express");
const router = express.Router();
const { Merchant, Product } = require("../models/index");
const { Op } = require("sequelize");

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
                <a href="${waLink}" target="_blank" class="btn-order">Commander →</a>
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
    <p>Contactez-nous sur WhatsApp pour commander</p>
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
    <span style="opacity:0.4;font-size:11px">Propulsé par <a href="/">WaziBot</a></span>
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
</body>
</html>`;
};

module.exports = router;