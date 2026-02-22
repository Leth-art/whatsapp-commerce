const { syncProductToMeta, deleteProductFromMeta } = require('../modules/metaCatalog');
const { Product, Merchant } = require('../models/index');
const { v4: uuidv4 } = require('uuid');

const createProduct = async (req, res) => {
  try {
    const merchant = await Merchant.findByPk(req.params.id);
    if (!merchant) return res.status(404).json({ error: 'Commerçant introuvable' });
    const product = await Product.create({
      id: uuidv4(), merchantId: merchant.id,
      name: req.body.name, price: parseFloat(req.body.price) || 0,
      stock: parseInt(req.body.stock) || 0, category: req.body.category || '',
      description: req.body.description || '', imageUrl: req.body.imageUrl || '',
      isAvailable: req.body.isAvailable !== false,
    });
    const metaProductId = await syncProductToMeta(product, merchant);
    if (metaProductId) await product.update({ metaProductId });
    res.status(201).json(product);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const updateProduct = async (req, res) => {
  try {
    const merchant = await Merchant.findByPk(req.params.id);
    if (!merchant) return res.status(404).json({ error: 'Commerçant introuvable' });
    const product = await Product.findOne({ where: { id: req.params.productId, merchantId: req.params.id } });
    if (!product) return res.status(404).json({ error: 'Produit introuvable' });
    await product.update({
      name: req.body.name || product.name, price: parseFloat(req.body.price) || product.price,
      stock: parseInt(req.body.stock) ?? product.stock, category: req.body.category || product.category,
      description: req.body.description || product.description, imageUrl: req.body.imageUrl || product.imageUrl,
      isAvailable: req.body.isAvailable !== undefined ? req.body.isAvailable : product.isAvailable,
    });
    await syncProductToMeta(product, merchant);
    res.json(product);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const deleteProduct = async (req, res) => {
  try {
    const merchant = await Merchant.findByPk(req.params.id);
    if (!merchant) return res.status(404).json({ error: 'Commerçant introuvable' });
    const product = await Product.findOne({ where: { id: req.params.productId, merchantId: req.params.id } });
    if (!product) return res.status(404).json({ error: 'Produit introuvable' });
    if (product.metaProductId) await deleteProductFromMeta(product.metaProductId, merchant);
    await product.destroy();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

module.exports = { createProduct, updateProduct, deleteProduct };
