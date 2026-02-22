const Anthropic = require("@anthropic-ai/sdk");
const { formatCatalogForAI, getAllProducts } = require("../modules/catalog");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const buildSystemPrompt = (merchant, catalogText, customer) => {
  let customerInfo = "";
  if (customer.name) customerInfo += "Le client s'appelle " + customer.name + ". ";
  if (customer.totalOrders > 0) customerInfo += "C'est un client fidèle avec " + customer.totalOrders + " commande(s).";

  return "Tu es l'assistante virtuelle de la boutique *" + merchant.name + "* à " + merchant.city + ".\n\n" +
    (merchant.businessDescription || "") + "\n\n" +
    merchant.aiPersona + "\n\n" +
    customerInfo + "\n\n" +
    "---\nCATALOGUE ACTUEL :\n" + catalogText + "\n---\n\n" +
    "RÈGLES :\n" +
    "1. Réponds TOUJOURS en français, ton chaleureux et professionnel.\n" +
    "2. Prix en " + merchant.currency + ".\n" +
    "3. Pour commander, collecte : produits + quantités + adresse de livraison.\n" +
    "4. Quand la commande est prête, ajoute EXACTEMENT cette ligne à la fin :\n" +
    '   ACTION:CREATE_ORDER:{"items":{"productId":quantity},"address":"adresse","payment":"mobile_money"}\n' +
    "5. Si tu détectes le prénom du client, ajoute : ACTION:UPDATE_NAME:Prénom\n" +
    "6. Ne réponds jamais à des sujets hors commerce.\n" +
    "7. Sois concise — messages courts et lisibles sur WhatsApp.";
};

const extractActions = (responseText) => {
  const lines = responseText.trim().split("\n");
  const cleanLines = [];
  const actions = [];
  for (const line of lines) {
    if (line.startsWith("ACTION:CREATE_ORDER:")) {
      try {
        const payload = JSON.parse(line.replace("ACTION:CREATE_ORDER:", ""));
        actions.push({ type: "CREATE_ORDER", data: payload });
      } catch {}
    } else if (line.startsWith("ACTION:UPDATE_NAME:")) {
      const name = line.replace("ACTION:UPDATE_NAME:", "").trim();
      if (name) actions.push({ type: "UPDATE_NAME", data: { name } });
    } else {
      cleanLines.push(line);
    }
  }
  return { cleanText: cleanLines.join("\n").trim(), actions };
};

const generateAIResponse = async ({ merchant, customer, session, userMessage }) => {
  const catalogText = await formatCatalogForAI(merchant.id, merchant.currency);
  const allProducts = await getAllProducts(merchant.id);
  const systemPrompt = buildSystemPrompt(merchant, catalogText, customer);

  // Garder uniquement les 10 derniers messages pour réduire les tokens
  const messagesHistory = (session.messages || [])
    .slice(-10)
    .map(m => ({ role: m.role, content: m.content }));

  let messageContent = userMessage;
  const cart = session.cart || {};
  if (Object.keys(cart).length > 0) {
    messageContent += "\n\n[Panier actuel : " + session.cartSummary(allProducts) + "]";
  }

  messagesHistory.push({ role: "user", content: messageContent });

  const response = await client.messages.create({
    // Haiku = 10x moins cher qu'Opus, largement suffisant pour WhatsApp
    model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
    max_tokens: 512, // Réduit de 1024 à 512 — messages WhatsApp courts
    system: systemPrompt,
    messages: messagesHistory,
  });

  console.log(`🤖 IA | Tokens utilisés: ${response.usage.input_tokens} in / ${response.usage.output_tokens} out`);

  return extractActions(response.content[0].text);
};

module.exports = { generateAIResponse };