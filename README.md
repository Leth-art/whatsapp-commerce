# 🛍️ WhatsApp Commerce IA — SaaS Togo (Node.js)

Assistant IA multi-tenant pour commerçants togolais sur WhatsApp Business.  
**Stack : Node.js + Express.js + MongoDB + Mongoose + Claude (Anthropic) + Moneroo**

---

## 🏗️ Structure du projet

```
whatsapp-commerce/
├── src/
│   ├── app.js                        # Serveur Express principal
│   ├── seed.js                       # Données de démonstration
│   │
│   ├── models/
│   │   ├── Merchant.js               # Commerçant abonné au SaaS
│   │   ├── Product.js                # Catalogue produits
│   │   ├── Customer.js               # Clients (CRM)
│   │   ├── Order.js                  # Commandes
│   │   └── ConversationSession.js    # Mémoire des conversations
│   │
│   ├── core/
│   │   ├── aiEngine.js               # Moteur IA Claude (Anthropic)
│   │   ├── whatsappClient.js         # Client API WhatsApp Business
│   │   └── router.js                 # Chef d'orchestre message → IA → réponse
│   │
│   ├── modules/
│   │   ├── crm.js                    # Gestion clients et sessions
│   │   ├── catalog.js                # Gestion catalogue produits
│   │   ├── orders.js                 # Création et suivi commandes
│   │   └── payments.js              # Abonnements via Moneroo
│   │
│   └── routes/
│       ├── webhook.js                # Webhook WhatsApp (Meta)
│       ├── api.js                    # API REST (commerçants, produits, commandes)
│       └── subscriptions.js         # Paiements abonnements Moneroo
│
└── config/
    └── database.js                   # Connexion MongoDB
```

---

## ⚡ Démarrage rapide

```bash
# 1. Installer les dépendances
npm install

# 2. Configurer les variables d'environnement
cp .env.example .env
# Éditez .env avec vos clés

# 3. Charger les données de démo
npm run seed

# 4. Lancer le serveur
npm run dev

# 5. Exposer en local (dev)
ngrok http 3000
# → Configurer l'URL dans Meta for Developers : https://NGROK-URL/webhook
```

---

## 📡 API Reference

### Commerçants
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/api/merchants` | Créer un commerçant |
| GET | `/api/merchants/:id` | Infos + stats commerçant |
| PATCH | `/api/merchants/:id` | Modifier un commerçant |
| GET | `/api/merchants/:id/stats` | Dashboard stats |

### Catalogue
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/api/merchants/:id/products` | Ajouter un produit |
| GET | `/api/merchants/:id/products` | Lister les produits |
| PATCH | `/api/merchants/:id/products/:pid` | Modifier un produit |
| DELETE | `/api/merchants/:id/products/:pid` | Supprimer un produit |

### Commandes
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/merchants/:id/orders` | Lister les commandes |
| PATCH | `/api/orders/:id/status` | Mettre à jour le statut |

### Abonnements Moneroo
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/subscription/plans` | Plans disponibles |
| POST | `/subscription/initiate` | Créer un lien de paiement |
| GET | `/subscription/callback` | Retour après paiement |
| POST | `/subscription/webhook` | Webhook Moneroo |
| GET | `/subscription/status/:id` | Statut abonnement |

---

## 🔄 Flux d'une conversation

```
Client WhatsApp ──► Webhook ──► Router
                                  │
                        Identifier le commerçant
                        Vérifier l'abonnement
                        Récupérer/créer le client (CRM)
                        Récupérer/créer la session
                                  │
                      ┌───────────────────────┐
                      │   IA Claude Anthropic  │
                      │ • Catalogue en contexte│
                      │ • Historique 20 msgs   │
                      │ • Panier en cours      │
                      └───────────────────────┘
                                  │
                      Parser les actions IA
                      ┌───────────┼───────────┐
                UPDATE_NAME  CREATE_ORDER  (texte)
                                  │
                      Envoyer réponse WhatsApp
```

---

## 💰 Plans tarifaires (FCFA)

| Plan | Prix/mois | Fonctionnalités |
|------|-----------|-----------------|
| Starter | 15 000 FCFA | 50 produits, 500 messages/mois |
| Pro | 35 000 FCFA | Illimité + relances + analytique |
| Business | 70 000 FCFA | Tout + support prioritaire |

---

## 🗺️ Roadmap

- ✅ **Phase 1** — MVP : Webhook, IA, Catalogue, Commandes, CRM, Moneroo
- 🔜 **Phase 2** — Dashboard commerçant (React/Vue) + Notifications WhatsApp
- 🔜 **Phase 3** — Relances automatiques (node-cron) + Analytique
- 🔜 **Phase 4** — Onboarding self-service + Facturation automatique
