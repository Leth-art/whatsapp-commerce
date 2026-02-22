/**
 * modules/metaCatalog.js
 * Synchronisation bidirectionnelle entre la base de données et le catalogue WhatsApp Business
 * Actif uniquement quand l'app Meta est approuvée en mode Live
 */

const axios = require('axios');

const META_API = 'https://graph.facebook.com/v18.0';

/**
 * Vérifie si la synchro Meta est activée
 */
const isSyncEnabled = () => {
  return process.env.META_CATALOG_SYNC === 'true' && 
         process.env.META_CATALOG_ID && 
         process.env.WHATSAPP_TOKEN;
};

/**
 * Ajoute ou met à jour un produit dans le catalogue WhatsApp Business
 */
const syncProductToMeta = async (product, merchant) => {
  if (!isSyncEnabled()) {
    console.log('📦 Synchro Meta désactivée — produit enregistré en base uniquement');
    return null;
  }

  try {
    const catalogId = process.env.META_CATALOG_ID;
    const token = merchant.whatsappToken || process.env.WHATSAPP_TOKEN;

    const payload = {
      name: product.name,
      description: product.description || product.name,
      price: Math.round(product.price * 100), // en centimes
      currency: merchant.currency || 'XOF',
      availability: product.isAvailable ? 'in stock' : 'out of stock',
      condition: 'new',
      retailer_id: product.id,
      url: `https://wa.me/${process.env.WHATSAPP_PHONE_NUMBER_ID}`,
    };

    // Ajouter l'image si disponible
    if (product.imageUrl) {
      payload.image_url = product.imageUrl;
    }

    let response;
    
    if (product.metaProductId) {
      // Mise à jour d'un produit existant
      response = await axios.post(
        `${META_API}/${product.metaProductId}`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log(`✅ Produit mis à jour dans Meta Catalog : ${product.name}`);
    } else {
      // Création d'un nouveau produit
      response = await axios.post(
        `${META_API}/${catalogId}/products`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log(`✅ Produit ajouté dans Meta Catalog : ${product.name}`);
    }

    return response.data.id || null;

  } catch (err) {
    console.error('❌ Erreur synchro Meta Catalog:', err.response?.data || err.message);
    return null;
  }
};

/**
 * Supprime un produit du catalogue WhatsApp Business
 */
const deleteProductFromMeta = async (metaProductId, merchant) => {
  if (!isSyncEnabled() || !metaProductId) return;

  try {
    const token = merchant.whatsappToken || process.env.WHATSAPP_TOKEN;
    await axios.delete(
      `${META_API}/${metaProductId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    console.log(`🗑️ Produit supprimé du Meta Catalog : ${metaProductId}`);
  } catch (err) {
    console.error('❌ Erreur suppression Meta Catalog:', err.response?.data || err.message);
  }
};

/**
 * Synchronise tous les produits d'un commerçant vers Meta
 */
const syncAllProductsToMeta = async (merchant, products) => {
  if (!isSyncEnabled()) return;

  console.log(`🔄 Synchro complète Meta Catalog pour ${merchant.name}...`);
  let synced = 0;

  for (const product of products) {
    const metaId = await syncProductToMeta(product, merchant);
    if (metaId) synced++;
    await new Promise(r => setTimeout(r, 500)); // éviter rate limiting
  }

  console.log(`✅ ${synced}/${products.length} produits synchronisés`);
  return synced;
};

module.exports = {
  syncProductToMeta,
  deleteProductFromMeta,
  syncAllProductsToMeta,
  isSyncEnabled,
};
