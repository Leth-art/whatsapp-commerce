# WhatsApp Commerce IA — Guide de déploiement sur Render.com

## Étape 1 — Préparer le projet sur GitHub

1. Créez un compte sur https://github.com
2. Créez un nouveau repository appelé `whatsapp-commerce`
3. Dans votre terminal :

```cmd
cd C:\Users\salem\Desktop\ChatBot\src
git init
git add .
git commit -m "Premier déploiement"
git remote add origin https://github.com/VOTRE_USERNAME/whatsapp-commerce.git
git push -u origin main
```

## Étape 2 — Créer la base PostgreSQL sur Render

1. Allez sur https://render.com et créez un compte
2. Cliquez **New** → **PostgreSQL**
3. Nom : `whatsapp-commerce-db`
4. Plan : **Free**
5. Cliquez **Create Database**
6. Copiez l'**Internal Database URL** — vous en aurez besoin

## Étape 3 — Déployer le serveur sur Render

1. Cliquez **New** → **Web Service**
2. Connectez votre repository GitHub
3. Configurez :
   - **Name** : `whatsapp-commerce`
   - **Runtime** : `Node`
   - **Build Command** : `npm install`
   - **Start Command** : `node app.js`
   - **Plan** : Free

4. Dans **Environment Variables**, ajoutez :
   - `DATABASE_URL` → l'URL PostgreSQL copiée à l'étape 2
   - `ANTHROPIC_API_KEY` → votre clé Anthropic
   - `WHATSAPP_API_URL` → `https://graph.facebook.com/v19.0`
   - `WHATSAPP_APP_SECRET` → votre app secret Meta
   - `WHATSAPP_VERIFY_TOKEN` → `montoken123`
   - `MONEROO_SECRET_KEY` → votre clé Moneroo
   - `APP_BASE_URL` → `https://whatsapp-commerce.onrender.com`
   - `NODE_ENV` → `production`

5. Cliquez **Create Web Service**

## Étape 4 — Mettre à jour le webhook Meta

Une fois déployé, vous aurez une URL comme :
`https://whatsapp-commerce.onrender.com`

Allez dans Meta for Developers → WhatsApp → Configuration → Webhook
Remplacez l'URL par :
`https://whatsapp-commerce.onrender.com/webhook`

## Étape 5 — Vérifier

Visitez : https://whatsapp-commerce.onrender.com
Vous devriez voir : `{"status": "WhatsApp Commerce IA — En ligne"}`
