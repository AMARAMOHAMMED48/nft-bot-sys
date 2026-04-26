# NFT Bot System

Système de trading NFT autonome sur Ethereum (OpenSea / Blur).  
Multi-utilisateurs · Fully automated · Paper trading → Réel

---

## Architecture

```
nft-bot-system/
├── apps/
│   ├── api/          Express — Auth JWT, routes CRUD, gestion wallets
│   ├── bot-core/     Node.js — Moteur de trading (offres, achats, listings)
│   ├── bot-discord/  Notifications Discord par webhook
│   └── frontend/     Next.js — Dashboard, config, offres, trades
├── prisma/
│   └── schema.prisma
└── package.json      npm workspaces
```

```
Frontend (Vercel / localhost:3000)
        ↓ HTTPS + JWT
API Express (localhost:4000)
        ↓ DB polling 30s
Bot Core (daemon)
        ↓ Alchemy + OpenSea + Blur
Ethereum Mainnet
```

---

## Prérequis

- Node.js 20+
- PostgreSQL 14+
- Clés API : Alchemy, OpenSea, Etherscan

---

## Installation

```bash
git clone <repo>
cd nft-bot-system
npm install
```

### Variables d'environnement

```bash
# API
cp apps/api/.env.example apps/api/.env

# Bot Core
cp apps/bot-core/.env.example apps/bot-core/.env

# Frontend
echo "NEXT_PUBLIC_API_URL=http://localhost:4000" > apps/frontend/.env.local
```

Génère les clés de sécurité :

```bash
# ENCRYPTION_KEY (même valeur dans api/.env et bot-core/.env)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# JWT_SECRET (dans api/.env)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Base de données

```bash
createdb nftbot
npm run db:migrate
```

---

## Démarrage

```bash
# Terminal 1 — API
cd apps/api && node index.js

# Terminal 2 — Bot Core
cd apps/bot-core && node src/index.js

# Terminal 3 — Frontend
cd apps/frontend && npm run dev
```

Frontend : `http://localhost:3000`  
Prisma Studio : `npm run db:studio` → `http://localhost:5555`

---

## Workflow utilisateur

1. **S'inscrire** → `/login` → créer un compte
2. **Ajouter son wallet** → Dashboard → coller sa clé privée (chiffrée AES-256)
3. **Ajouter des collections** → `/config` → adresse contrat + nom
4. **Configurer le bot** → `/config` → prix offre, budget, stop-loss
5. **Activer paper trading** → valider la stratégie sans risque
6. **Démarrer le bot** → Dashboard → bouton Démarrer
7. **Passer en réel** → après 14 jours de paper trading positif

---

## Configuration bot

| Paramètre | Description | Défaut |
|-----------|-------------|--------|
| `offerPriceEth` | Prix de l'offre en ETH | — |
| `offerExpiryMin` | Durée de l'offre en minutes | 1440 (24h) |
| `budgetMaxEth` | Budget total maximum engagé | 1.0 ETH |
| `stopLossEth` | Perte maximale avant arrêt auto | 0.15 ETH |
| `buyTriggerPct` | Seuil snipe (% du floor) | 0.88 (−12%) |
| `maxGasGwei` | Gas maximum autorisé | 35 gwei |
| `maxPositions` | NFTs détenus simultanément max | 3 |
| `timeoutSellH` | Timeout listing en heures | 72h |
| `paperTrading` | Mode simulation | true |

### Config par collection

Chaque collection peut avoir son propre prix et durée d'offre (override de la config globale) via `/config` → clic sur la collection.

---

## Flux automatiques

### Offre acceptée → Listing automatique
```
Alchemy détecte le NFT dans le wallet (toutes les 30s)
→ Trade créé en DB
→ NFT listé au floor price automatiquement
→ Notification Discord
```

### Snipe sous floor
```
OpenSea/Blur polling (toutes les 20s)
→ Listing détecté sous floor × buyTriggerPct
→ Achat automatique
→ Listing immédiat au floor
→ Notification Discord
```

### Stop-loss
```
Cycle toutes les 60s
→ P&L total ≤ -stopLossEth
→ Bot arrêté automatiquement
→ Alerte Discord critique
```

---

## Sécurité

- Clé privée chiffrée **AES-256-GCM** — jamais en clair en DB ni dans les logs
- `ENCRYPTION_KEY` uniquement dans `.env` — jamais commitée
- JWT en **httpOnly cookie** — pas localStorage
- Rate limiting : 100 req/min (général), 10/15min (auth)
- CORS strict vers domaine frontend uniquement
- Ports EC2 publics : **80, 443, 22 uniquement**

---

## Déploiement EC2

```bash
# Swap obligatoire sur t3.micro
sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# PM2
npm install -g pm2
pm2 start apps/api/index.js --name "trading-api"
pm2 start apps/bot-core/src/index.js --name "bot-core"
pm2 save && pm2 startup
```

### Nginx

```nginx
server {
    listen 443 ssl;
    server_name api.ton-domaine.com;

    location / {
        proxy_pass http://localhost:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
sudo certbot --nginx -d api.ton-domaine.com
```

---

## Critères go/no-go paper → réel

- [ ] P&L simulé positif sur 14 jours consécutifs
- [ ] Win rate > 60%
- [ ] Gas simulé < 30% du profit brut
- [ ] Bot actif 24/7 sans crash
- [ ] Stop-loss déclenché correctement
- [ ] Aucune clé privée dans les logs : `pm2 logs | grep -i private`

---

## Stack

| Couche | Technologie |
|--------|-------------|
| API | Express 4 + JWT |
| Bot | Node.js 20 + ethers.js 6 |
| Frontend | Next.js 14 |
| DB | PostgreSQL + Prisma 5 |
| NFT Data | Alchemy NFT API + OpenSea API v2 + Blur API |
| Signing | Seaport 1.6 (EIP-712) |
| Notifications | Discord Webhook |
| Hosting | EC2 + Vercel + PM2 |
