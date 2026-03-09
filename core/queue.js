/**
 * queue.js — Système de queue BullMQ pour messages WhatsApp
 * Gère : réponses IA, création de commandes, scheduling de relances
 * Fallback in-memory si Redis non disponible
 */

let Queue, Worker, QueueEvents;
let useQueue = false;

// ─── Tentative de chargement BullMQ ──────────────────────────────────────────
try {
  ({ Queue, Worker, QueueEvents } = require("bullmq"));
  if (process.env.REDIS_URL) {
    useQueue = true;
    console.log("✅ BullMQ activé");
  }
} catch {
  console.warn("⚠️ BullMQ non disponible, traitement synchrone");
}

const redisConnection = process.env.REDIS_URL
  ? { connection: { url: process.env.REDIS_URL } }
  : null;

// ─── Queue principale ─────────────────────────────────────────────────────────
let messageQueue = null;

if (useQueue && redisConnection) {
  messageQueue = new Queue("whatsapp-messages", redisConnection);
}

// ─── Fallback in-memory ───────────────────────────────────────────────────────
const inMemoryQueue = [];
let isProcessing = false;

const processInMemory = async (handler) => {
  if (isProcessing || inMemoryQueue.length === 0) return;
  isProcessing = true;
  while (inMemoryQueue.length > 0) {
    const job = inMemoryQueue.shift();
    try {
      await handler(job);
    } catch (err) {
      console.error("❌ Erreur traitement message:", err.message);
    }
  }
  isProcessing = false;
};

// ─── Ajoute un message WhatsApp à la queue ────────────────────────────────────
const addMessageToQueue = async (messageData) => {
  const job = {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    data: messageData,
    timestamp: new Date().toISOString(),
  };

  if (messageQueue) {
    await messageQueue.add("process-message", messageData, {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    });
    console.log(`📨 Message en queue BullMQ — from:${messageData.from}`);
  } else {
    inMemoryQueue.push(job);
    console.log(`📨 Message en queue in-memory — from:${messageData.from} (${inMemoryQueue.length} en attente)`);
  }

  return job.id;
};

// ─── Worker de traitement ─────────────────────────────────────────────────────
const startWorker = (handler) => {
  if (messageQueue && redisConnection) {
    // Worker BullMQ
    const worker = new Worker(
      "whatsapp-messages",
      async (job) => {
        console.log(`⚙️ Worker BullMQ — traitement job ${job.id}`);
        await handler(job.data);
      },
      {
        ...redisConnection,
        concurrency: 5, // 5 messages en parallèle max
      }
    );

    worker.on("completed", (job) => {
      console.log(`✅ Job ${job.id} traité`);
    });

    worker.on("failed", (job, err) => {
      console.error(`❌ Job ${job?.id} échoué:`, err.message);
    });

    console.log("🚀 Worker BullMQ démarré");
    return worker;
  } else {
    // Worker in-memory — traitement toutes les 100ms
    const interval = setInterval(() => processInMemory(handler), 100);
    console.log("🚀 Worker in-memory démarré");
    return { close: () => clearInterval(interval) };
  }
};

// ─── Stats de la queue ────────────────────────────────────────────────────────
const getQueueStats = async () => {
  if (messageQueue) {
    const [waiting, active, completed, failed] = await Promise.all([
      messageQueue.getWaitingCount(),
      messageQueue.getActiveCount(),
      messageQueue.getCompletedCount(),
      messageQueue.getFailedCount(),
    ]);
    return { type: "bullmq", waiting, active, completed, failed };
  }
  return {
    type: "in-memory",
    waiting: inMemoryQueue.length,
    active: isProcessing ? 1 : 0,
  };
};

module.exports = { addMessageToQueue, startWorker, getQueueStats };
