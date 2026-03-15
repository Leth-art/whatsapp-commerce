/**
 * upload.js — Upload d'images vers Cloudinary
 * Gratuit jusqu'à 25GB — parfait pour les images produits
 *
 * Variables .env à ajouter sur Render :
 *   CLOUDINARY_CLOUD_NAME=ton_cloud_name
 *   CLOUDINARY_API_KEY=ta_api_key
 *   CLOUDINARY_API_SECRET=ton_api_secret
 *
 * Compte gratuit sur : https://cloudinary.com
 */

const https = require("https");
const crypto = require("crypto");

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY    = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

/**
 * Upload une image base64 vers Cloudinary
 * @param {string} base64Data - Image en base64 (avec ou sans prefix data:image/...)
 * @param {string} folder - Dossier dans Cloudinary (ex: "wazibot/products")
 * @param {string} publicId - Nom du fichier (optionnel)
 * @returns {Promise<{url: string, publicId: string}>}
 */
const uploadImage = async (base64Data, folder = "wazibot/products", publicId = null) => {
  if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
    throw new Error("Cloudinary non configuré. Ajoutez CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET dans .env");
  }

  // Nettoie le prefix data:image si présent
  const imageData = base64Data.replace(/^data:image\/\w+;base64,/, "");

  const timestamp = Math.round(Date.now() / 1000);

  // Génère la signature
  const params = { folder, timestamp };
  if (publicId) params.public_id = publicId;

  const sortedParams = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join("&");
  const signature = crypto.createHash("sha256").update(sortedParams + API_SECRET).digest("hex");

  // Construit le body multipart
  const boundary = "----WaziBotBoundary" + Date.now();
  const fields = {
    ...params,
    signature,
    api_key: API_KEY,
    file: `data:image/jpeg;base64,${imageData}`,
  };

  let body = "";
  for (const [key, value] of Object.entries(fields)) {
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
    body += `${value}\r\n`;
  }
  body += `--${boundary}--\r\n`;

  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.cloudinary.com",
      path: `/v1_1/${CLOUD_NAME}/image/upload`,
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const result = JSON.parse(data);
          if (result.error) return reject(new Error(result.error.message));
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            width: result.width,
            height: result.height,
          });
        } catch (e) {
          reject(new Error("Réponse Cloudinary invalide"));
        }
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
};

/**
 * Supprime une image de Cloudinary
 */
const deleteImage = async (publicId) => {
  if (!CLOUD_NAME || !API_KEY || !API_SECRET) return;
  const timestamp = Math.round(Date.now() / 1000);
  const signature = crypto.createHash("sha256")
    .update(`public_id=${publicId}&timestamp=${timestamp}${API_SECRET}`)
    .digest("hex");

  const body = `public_id=${encodeURIComponent(publicId)}&timestamp=${timestamp}&api_key=${API_KEY}&signature=${signature}`;

  return new Promise((resolve) => {
    const req = https.request({
      hostname: "api.cloudinary.com",
      path: `/v1_1/${CLOUD_NAME}/image/destroy`,
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    }, (res) => {
      res.on("data", () => {});
      res.on("end", resolve);
    });
    req.on("error", resolve);
    req.write(body);
    req.end();
  });
};

/**
 * Vérifie si Cloudinary est configuré
 */
const isConfigured = () => !!(CLOUD_NAME && API_KEY && API_SECRET);

module.exports = { uploadImage, deleteImage, isConfigured };
