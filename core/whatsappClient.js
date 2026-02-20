const axios = require("axios");
const crypto = require("crypto");

const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL || "https://graph.facebook.com/v19.0";

const sendText = async (phoneNumberId, token, to, message) => {
  const parts = message.length > 4000 ? [message.slice(0, 4000), message.slice(4000)] : [message];
  for (const part of parts) {
    await axios.post(WHATSAPP_API_URL + "/" + phoneNumberId + "/messages",
      { messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { body: part } },
      { headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" } }
    );
  }
};

const markAsRead = async (phoneNumberId, token, messageId) => {
  await axios.post(WHATSAPP_API_URL + "/" + phoneNumberId + "/messages",
    { messaging_product: "whatsapp", status: "read", message_id: messageId },
    { headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" } }
  ).catch(() => {});
};

const verifySignature = (rawBody, signature) => {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) return true;
  const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from("sha256=" + expected), Buffer.from(signature));
};

const parseWebhook = (data) => {
  const messages = [];
  try {
    for (const entry of data.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value || {};
        const phoneNumberId = value.metadata && value.metadata.phone_number_id;
        for (const msg of value.messages || []) {
          let content = "";
          if (msg.type === "text") content = msg.text.body;
          else if (msg.type === "interactive") {
            const i = msg.interactive;
            content = (i.button_reply && i.button_reply.title) || (i.list_reply && i.list_reply.title) || "";
          } else if (msg.type === "image") content = "[Image envoyée]";
          else if (msg.type === "audio") content = "[Message vocal non supporté]";
          if (content) messages.push({ messageId: msg.id, from: msg.from, phoneNumberId, content, type: msg.type });
        }
      }
    }
  } catch (err) { console.error("Erreur parsing webhook :", err.message); }
  return messages;
};

module.exports = { sendText, markAsRead, verifySignature, parseWebhook };
