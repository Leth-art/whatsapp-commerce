const mongoose = require("mongoose");

const merchantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, default: "" },
    ownerPhone: { type: String, default: "" },
    phoneNumberId: { type: String, default: "" },   // plus required ni unique
    whatsappToken: { type: String, default: "" },   // plus required
    businessDescription: { type: String, default: "" },
    aiPersona: {
      type: String,
      default: "Tu es l'assistante de cette boutique, toujours disponible pour aider les clients.",
    },
    welcomeMessage: {
      type: String,
      default: "Bonjour ! 👋 Bienvenue. Comment puis-je vous aider ?",
    },
    city: { type: String, default: "" },
    country: { type: String, default: "" },
    currency: { type: String, default: "XOF" },
    isActive: { type: Boolean, default: true },
    plan: { type: String, enum: ["starter", "pro", "business"], default: "starter" },
    subscriptionExpiresAt: { type: Date, default: null },
    lastPaymentId: { type: String, default: null },
  },
  { timestamps: true }
);

merchantSchema.methods.isSubscriptionActive = function () {
  if (!this.subscriptionExpiresAt) return false;
  return this.subscriptionExpiresAt > new Date();
};

module.exports = mongoose.model("Merchant", merchantSchema);