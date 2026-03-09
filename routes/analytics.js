/**
 * analytics.js — API Analytics pour commerçants
 * GET /analytics/merchant/:id?period=daily|weekly|monthly
 * Métriques : conversations, commandes IA, revenus, clients récurrents
 */

const express = require("express");
const router = express.Router();
const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const { Merchant, Order, Customer, ConversationSession } = require("../models/index");

// ─── Helpers dates ────────────────────────────────────────────────────────────
const getPeriodDates = (period) => {
  const now = new Date();
  const periods = {
    daily: {
      current: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
      previous: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1),
      label: "Aujourd'hui",
    },
    weekly: {
      current: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      previous: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
      label: "7 derniers jours",
    },
    monthly: {
      current: new Date(now.getFullYear(), now.getMonth(), 1),
      previous: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      label: "Ce mois",
    },
  };
  return periods[period] || periods.monthly;
};

// ─── GET /analytics/merchant/:id ─────────────────────────────────────────────
router.get("/merchant/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const period = req.query.period || "monthly"; // daily | weekly | monthly

    const merchant = await Merchant.findByPk(id);
    if (!merchant) return res.status(404).json({ error: "Commerçant introuvable" });

    const dates = getPeriodDates(period);
    const { current, previous } = dates;
    const now = new Date();

    // ── 1. Total conversations ──────────────────────────────────────────────
    const totalConversations = await ConversationSession.count({
      where: {
        merchantId: id,
        createdAt: { [Op.gte]: current },
      },
    });

    const prevConversations = await ConversationSession.count({
      where: {
        merchantId: id,
        createdAt: { [Op.between]: [previous, current] },
      },
    });

    // ── 2. Commandes générées par l'IA ──────────────────────────────────────
    // Commandes IA = commandes avec paymentMethod 'whatsapp' ou sans intervention manuelle
    // On considère que toutes les commandes créées automatiquement (sans admin) sont IA
    const aiGeneratedOrders = await Order.count({
      where: {
        merchantId: id,
        createdAt: { [Op.gte]: current },
        paymentMethod: { [Op.in]: ["mobile_money", "whatsapp", "cash_on_delivery"] },
        // Exclure les commandes créées manuellement via le dashboard
        notes: { [Op.notLike]: "%manuel%" },
      },
    });

    // Total commandes (IA + manuel)
    const totalOrders = await Order.count({
      where: {
        merchantId: id,
        createdAt: { [Op.gte]: current },
      },
    });

    // ── 3. Revenus générés ──────────────────────────────────────────────────
    const revenueResult = await Order.findOne({
      attributes: [[sequelize.fn("SUM", sequelize.col("totalAmount")), "total"]],
      where: {
        merchantId: id,
        status: { [Op.in]: ["confirmed", "delivered"] },
        createdAt: { [Op.gte]: current },
      },
      raw: true,
    });
    const revenueGenerated = parseFloat(revenueResult?.total || 0);

    const prevRevenueResult = await Order.findOne({
      attributes: [[sequelize.fn("SUM", sequelize.col("totalAmount")), "total"]],
      where: {
        merchantId: id,
        status: { [Op.in]: ["confirmed", "delivered"] },
        createdAt: { [Op.between]: [previous, current] },
      },
      raw: true,
    });
    const prevRevenue = parseFloat(prevRevenueResult?.total || 0);

    // ── 4. Clients récurrents ───────────────────────────────────────────────
    const returningCustomers = await Customer.count({
      where: {
        merchantId: id,
        totalOrders: { [Op.gte]: 2 },
        lastInteraction: { [Op.gte]: current },
      },
    });

    const totalCustomers = await Customer.count({
      where: {
        merchantId: id,
        createdAt: { [Op.gte]: current },
      },
    });

    // ── 5. Évolution quotidienne (30 derniers jours) ────────────────────────
    const dailyOrders = await Order.findAll({
      attributes: [
        [sequelize.fn("DATE", sequelize.col("createdAt")), "date"],
        [sequelize.fn("COUNT", sequelize.col("id")), "orders"],
        [sequelize.fn("SUM", sequelize.col("totalAmount")), "revenue"],
      ],
      where: {
        merchantId: id,
        createdAt: { [Op.gte]: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
      },
      group: [sequelize.fn("DATE", sequelize.col("createdAt"))],
      order: [[sequelize.fn("DATE", sequelize.col("createdAt")), "ASC"]],
      raw: true,
    });

    // ── 6. Top produits ─────────────────────────────────────────────────────
    const recentOrders = await Order.findAll({
      where: {
        merchantId: id,
        createdAt: { [Op.gte]: current },
      },
      attributes: ["items"],
      raw: true,
    });

    const productStats = {};
    for (const order of recentOrders) {
      let items = [];
      try { items = JSON.parse(order.items); } catch { continue; }
      for (const item of items) {
        if (!productStats[item.name]) productStats[item.name] = { count: 0, revenue: 0 };
        productStats[item.name].count += item.quantity || 1;
        productStats[item.name].revenue += item.total || 0;
      }
    }
    const topProducts = Object.entries(productStats)
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // ── Calcul variations ───────────────────────────────────────────────────
    const revenueGrowth = prevRevenue > 0
      ? Math.round(((revenueGenerated - prevRevenue) / prevRevenue) * 100)
      : revenueGenerated > 0 ? 100 : 0;

    const conversationsGrowth = prevConversations > 0
      ? Math.round(((totalConversations - prevConversations) / prevConversations) * 100)
      : totalConversations > 0 ? 100 : 0;

    // ── Réponse ─────────────────────────────────────────────────────────────
    res.json({
      success: true,
      merchant: {
        id: merchant.id,
        name: merchant.shopName || merchant.name,
        plan: merchant.plan,
        currency: merchant.currency || "XOF",
      },
      period: {
        label: dates.label,
        type: period,
        from: current.toISOString(),
        to: now.toISOString(),
      },
      metrics: {
        total_conversations: totalConversations,
        conversations_growth: conversationsGrowth,
        ai_generated_orders: aiGeneratedOrders,
        total_orders: totalOrders,
        ai_rate: totalOrders > 0 ? Math.round((aiGeneratedOrders / totalOrders) * 100) : 0,
        revenue_generated: revenueGenerated,
        revenue_growth: revenueGrowth,
        returning_customers: returningCustomers,
        total_customers: totalCustomers,
        retention_rate: totalCustomers > 0
          ? Math.round((returningCustomers / totalCustomers) * 100)
          : 0,
      },
      daily_evolution: dailyOrders.map((d) => ({
        date: d.date,
        orders: parseInt(d.orders),
        revenue: parseFloat(d.revenue || 0),
      })),
      top_products: topProducts,
    });
  } catch (err) {
    console.error("❌ Erreur analytics:", err);
    res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
});

// ─── GET /analytics/merchant/:id/summary (résumé rapide) ─────────────────────
router.get("/merchant/:id/summary", async (req, res) => {
  try {
    const { id } = req.params;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [orders, revenue, customers, conversations] = await Promise.all([
      Order.count({ where: { merchantId: id, createdAt: { [Op.gte]: monthStart } } }),
      Order.findOne({
        attributes: [[sequelize.fn("SUM", sequelize.col("totalAmount")), "total"]],
        where: { merchantId: id, status: { [Op.in]: ["confirmed", "delivered"] }, createdAt: { [Op.gte]: monthStart } },
        raw: true,
      }),
      Customer.count({ where: { merchantId: id } }),
      ConversationSession.count({ where: { merchantId: id, createdAt: { [Op.gte]: monthStart } } }),
    ]);

    res.json({
      success: true,
      monthly_orders: orders,
      monthly_revenue: parseFloat(revenue?.total || 0),
      total_customers: customers,
      monthly_conversations: conversations,
    });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
