const { Customer, ConversationSession } = require("../models/index");
const { v4: uuidv4 } = require("uuid");

const getOrCreateCustomer = async (merchantId, whatsappNumber) => {
  let customer = await Customer.findOne({ where: { merchantId, whatsappNumber } });
  if (!customer) {
    customer = await Customer.create({ id: uuidv4(), merchantId, whatsappNumber });
    console.log("Nouveau client : " + whatsappNumber);
  } else {
    customer.lastInteraction = new Date();
    await customer.save();
  }
  return customer;
};

const getOrCreateSession = async (merchantId, customerId) => {
  let session = await ConversationSession.findOne({ where: { merchantId, customerId, isActive: true } });
  if (!session) {
    session = await ConversationSession.create({ id: uuidv4(), merchantId, customerId, messages: [], cart: {}, state: "greeting" });
  }
  return session;
};

const updateCustomerName = async (customer, name) => {
  if (!customer.name && name) { customer.name = name; await customer.save(); }
};

const addMessageToSession = async (session, role, content) => {
  session.addMessage(role, content);
  await session.save();
};

const clearCart = async (session) => {
  session.cart = {};
  session.state = "post_order";
  await session.save();
};

module.exports = { getOrCreateCustomer, getOrCreateSession, updateCustomerName, addMessageToSession, clearCart };
