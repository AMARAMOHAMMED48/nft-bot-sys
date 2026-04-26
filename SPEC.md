# SPEC.md — NFT Bot System
> Version 2.0 | Avril 2026  
> Stack: Node.js + Next.js + Prisma + PostgreSQL + Discord  
 
---
 
## 1. Vue d'ensemble
 
### Objectif
Système unifié de trading NFT sur Ethereum (OpenSea / Blur) composé de 3 modules :
 
| Module | Rôle |
|--------|------|
| **Bot Discord** | Alertes NFT (existant) + notifications trading |
| **Bot Core** | Exécution automatique des offres, achats, listings |
| **Front Next.js** | Interface web privée pour contrôler le bot |
 
### Philosophie
- Toi tu décides le prix des offres — le bot exécute et gère la suite
- Offre acceptée → listing automatique au floor price
- Paper trading d'abord, argent réel après validation
- Front sécurisé : JWT + HTTPS + rate limiting
- Clé privée wallet jamais exposée au front
---
 
## 2. Architecture globale
 
```
┌─────────────────────────────────────────────────────┐
│  FRONT (Next.js — Vercel)                           │
│  - Dashboard P&L, trades, offres actives            │
│  - Formulaire : placer / annuler offres             │
│  - Contrôles : pause / resume / status              │
└──────────────────┬──────────────────────────────────┘
                   │ HTTPS + JWT
┌──────────────────▼──────────────────────────────────┐
│  API (Express — EC2)                                │
│  - Auth JWT + rate limiting                         │
│  - Routes : /offer /status /trades /pause           │
│  - Transmet commandes au Bot Core                   │
└──────────────────┬──────────────────────────────────┘
                   │ Internal
┌──────────────────▼──────────────────────────────────┐
│  BOT CORE (Node.js — EC2)                           │
│  - Reservoir WebSocket (listings + events)          │
│  - ethers.js (wallet + transactions)                │
│  - Logique offres / achat / listing                 │
│  - Prisma + PostgreSQL (historique)                 │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│  BOT DISCORD — EXISTANT (EC2)                       │
│  - Alertes floor, whale, listings (ne pas toucher)  │
│  - Nouveau module : notifications trading           │
└─────────────────────────────────────────────────────┘
```
 
---
 
## 3. Structure du projet
 
```
nft-bot-system/
│
├── apps/
│   ├── frontend/                  # Next.js — Vercel
│   │   ├── app/
│   │   │   ├── page.tsx           # Dashboard principal
│   │   │   ├── login/page.tsx     # Login
│   │   │   ├── offers/page.tsx    # Gestion offres
│   │   │   └── trades/page.tsx    # Historique trades
│   │   ├── components/
│   │   │   ├── OfferForm.tsx      # Formulaire placer offre
│   │   │   ├── ActiveOffers.tsx   # Liste offres actives
│   │   │   ├── TradeHistory.tsx   # Tableau historique
│   │   │   ├── PnlCard.tsx        # Carte P&L total
│   │   │   └── BotStatus.tsx      # Status bot
│   │   ├── lib/
│   │   │   ├── api.ts             # Appels vers l'API
│   │   │   └── auth.ts            # NextAuth config
│   │   └── .env.local
│   │
│   ├── api/                       # Express — EC2
│   │   ├── routes/
│   │   │   ├── auth.js            # POST /login → JWT
│   │   │   ├── wallet.js          # POST /wallet → chiffre + stocke clé
│   │   │   ├── collections.js     # CRUD collections par user
│   │   │   ├── config.js          # GET/PUT config bot par user
│   │   │   ├── offers.js          # POST/GET/DELETE /offers
│   │   │   ├── trades.js          # GET /trades, GET /pnl
│   │   │   └── bot.js             # /pause /resume /status
│   │   ├── middleware/
│   │   │   ├── auth.js            # Vérification JWT
│   │   │   └── rateLimit.js       # Rate limiting
│   │   ├── lib/
│   │   │   └── crypto.js          # AES-256-GCM encrypt/decrypt
│   │   └── index.js
│   │
│   ├── bot-core/                  # Bot trading — EC2
│   │   ├── src/
│   │   │   ├── data/
│   │   │   │   ├── reservoir.js   # WebSocket listings + events
│   │   │   │   ├── floorPrice.js  # Floor price polling 60s
│   │   │   │   └── gasPrice.js    # Gas price polling 30s
│   │   │   ├── engine/
│   │   │   │   ├── walletEngine.js # Orchestre engines par wallet/user
│   │   │   │   ├── offerEngine.js # Placer / annuler offres
│   │   │   │   ├── buyEngine.js   # Snipe sous floor
│   │   │   │   ├── listEngine.js  # Listing au floor
│   │   │   │   └── riskManager.js # Stop-loss, budget cap
│   │   │   ├── execution/
│   │   │   │   ├── offerer.js     # Reservoir SDK — offres WETH
│   │   │   │   ├── buyer.js       # Reservoir SDK — achat
│   │   │   │   ├── lister.js      # Reservoir SDK — listing
│   │   │   │   └── wallet.js      # ethers.js
│   │   │   ├── monitor/
│   │   │   │   ├── positions.js   # NFTs en portefeuille
│   │   │   │   ├── offers.js      # Offres actives + expiration
│   │   │   │   └── pnl.js         # P&L temps réel
│   │   │   └── index.js
│   │   └── .env
│   │
│   └── bot-discord/               # Discord — EC2
│       ├── src/
│       │   ├── alerts/            # EXISTANT — ne pas modifier
│       │   ├── trading/
│       │   │   └── notify.js      # Notifications trading (nouveau)
│       │   └── index.js
│       └── .env
│
├── prisma/
│   └── schema.prisma
└── package.json                   # npm workspaces
```
 
---
 
## 4. Schéma Prisma
 
> Multi-wallet : chaque User possède son propre wallet (clé chiffrée AES-256).
> Trade et Offer sont liés à un userId — P&L et historique isolés par trader.

```prisma
model User {
  id             String           @id @default(uuid())
  email          String           @unique
  passwordHash   String
  role           String           @default("trader")  // admin | trader | viewer
  // Wallet (chiffré AES-256-GCM)
  walletAddress  String?
  walletKeyEnc   String?
  // Bot config par user
  paperTrading   Boolean          @default(true)
  offerPriceEth  Float?
  offerMaxActive Int              @default(5)
  budgetMaxEth   Float            @default(1.0)
  stopLossEth    Float            @default(0.15)
  buyTriggerPct  Float            @default(0.88)
  maxGasGwei     Int              @default(35)
  timeoutSellH   Int              @default(72)
  maxPositions   Int              @default(3)
  botEnabled     Boolean          @default(false)
  discordWebhook String?
  createdAt      DateTime         @default(now())
  collections    UserCollection[]
  trades         Trade[]
  offers         Offer[]
  logs           BotLog[]
}

model UserCollection {
  id                String   @id @default(uuid())
  userId            String
  collectionAddress String
  collectionName    String
  enabled           Boolean  @default(true)
  createdAt         DateTime @default(now())
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, collectionAddress])
}

model Trade {
  id           String    @id @default(uuid())
  userId       String
  tokenId      String
  collection   String
  source       String    // "snipe" | "offer_accepted"
  buyPrice     Float
  buyTxHash    String?
  listPrice    Float?
  sellPrice    Float?
  sellTxHash   String?
  gasBuy       Float?
  gasSell      Float?
  pnl          Float?
  status       String    // "bought" | "listed" | "sold" | "timeout_sold"
  isPaperTrade Boolean   @default(true)
  boughtAt     DateTime  @default(now())
  listedAt     DateTime?
  soldAt       DateTime?
  user         User      @relation(fields: [userId], references: [id])
}
 
model Offer {
  id           String    @id @default(uuid())
  userId       String
  collection   String
  offerPrice   Float
  floorAtOffer Float
  offerTxHash  String?
  status       String    // "active" | "accepted" | "cancelled" | "expired"
  isPaperTrade Boolean   @default(true)
  expiresAt    DateTime
  createdAt    DateTime  @default(now())
  acceptedAt   DateTime?
  user         User      @relation(fields: [userId], references: [id])
}
 
model FloorSnapshot {
  id         String   @id @default(uuid())
  collection String
  floorPrice Float
  volume24h  Float?
  listings   Int?
  recordedAt DateTime @default(now())

  @@index([collection, recordedAt])
}
 
model BotLog {
  id        String   @id @default(uuid())
  userId    String?
  level     String   // "info" | "warn" | "error"
  module    String   // "offer" | "buy" | "list" | "alert" | "risk"
  message   String
  data      Json?
  createdAt DateTime @default(now())
  user      User?    @relation(fields: [userId], references: [id])
}
```
 
---
 
## 5. Variables d'environnement
 
### bot-core/.env
```env
DATABASE_URL=postgresql://user:pass@localhost:5432/nftbot
ENCRYPTION_KEY=hex_32_bytes_pour_AES256
ALCHEMY_API_KEY=...
RESERVOIR_API_KEY=...
```
 
### api/.env
```env
JWT_SECRET=secret_long_aleatoire_min_64_chars
DATABASE_URL=postgresql://user:pass@localhost:5432/nftbot
ENCRYPTION_KEY=hex_32_bytes_pour_AES256
PORT=4000
ALLOWED_ORIGINS=https://ton-front.vercel.app
```
 
### frontend/.env.local
```env
NEXTAUTH_SECRET=...
NEXTAUTH_URL=https://ton-front.vercel.app
NEXT_PUBLIC_API_URL=https://api.ton-domaine.com
```
 
---
 
## 6. Routes API
 
```
POST   /api/auth/register          → créer compte
POST   /api/auth/login             → JWT 24h (httpOnly cookie)

POST   /api/wallet                 → ajouter clé privée (chiffrement AES)
GET    /api/wallet                 → { address, hasKey: bool }
DELETE /api/wallet                 → supprimer clé

POST   /api/collections            → ajouter collection
GET    /api/collections            → liste collections du user
DELETE /api/collections/:id        → supprimer
PATCH  /api/collections/:id        → enable/disable

GET    /api/config                 → config bot du user
PUT    /api/config                 → update (prix offre, budget, etc.)

GET    /api/bot/status             → isRunning, floor, offres actives, WETH, P&L
POST   /api/bot/start              → démarre le bot pour ce user
POST   /api/bot/pause              → stoppe achats + offres
POST   /api/bot/resume             → relance

GET    /api/offers                 → offres actives du user
DELETE /api/offers/:id             → annuler offre

GET    /api/trades                 → historique trades user
GET    /api/pnl                    → { totalPnl, winRate, totalTrades }
```
 
---
 
## 7. Flux complets
 
### A — Setup initial (une seule fois par user)
```
User s'inscrit → front
User ajoute clé privée → POST /api/wallet
  API chiffre AES-256-GCM → stocke walletKeyEnc en DB
  walletAddress dérivé depuis la clé → stocké en DB
User ajoute collection → POST /api/collections
User configure bot → PUT /api/config { offerPriceEth: 0.18, ... }
User démarre le bot → POST /api/bot/start
  bot-core charge config + déchiffre clé en mémoire
  démarre WalletEngine pour ce user
```

### B — Cycle offres automatique
```
WalletEngine[user]
  → floor price actuel : 0.200 ETH
  → offerPrice config user : 0.18 ETH
  → offres actives < offerMaxActive ET WETH ok ET gas ok ?
    → PAPER=true  → simule + DB
    → PAPER=false → place offre Reservoir SDK (signe avec ethers.js)
    → Discord webhook user : "✅ Offre placée 0.18 ETH"
```
 
### C — Offre acceptée → listing automatique
```
Reservoir WebSocket → "offer_accepted"
DB : Offer { status: "accepted" }
DB : Trade { source: "offer_accepted", buyPrice: 0.18 }
Fetch floor price actuel → 0.200 ETH
PAPER=false → liste NFT à 0.200 ETH (signe avec ethers.js)
DB : Trade { status: "listed", listPrice: 0.200 }
Discord : "🎯 Offre acceptée #5678 → Listé à 0.200 ETH"
```
 
### D — Snipe sous floor
```
Reservoir WebSocket → nouveau listing
Prix <= floor × buyTriggerPct ET gas <= maxGasGwei ?
  → positions < maxPositions ET budget ok ?
    → PAPER=false → achat Reservoir SDK
    → Listing immédiat au floor price
    → Discord : "🟢 Snipe → Acheté 0.176 → Listé 0.200"
```
 
### E — Vente exécutée
```
Reservoir WebSocket → "sale" sur notre NFT
DB : Trade { status: "sold", sellPrice, soldAt }
P&L = sellPrice - buyPrice - gasBuy - gasSell
Discord + front mis à jour
```
 
### F — Stop-loss par user
```
Cron 60s → P&L total user <= -stopLossEth ?
→ WalletEngine[user] s'arrête
→ DB : botEnabled: false
→ Discord user : "🔴 STOP-LOSS — Bot arrêté"
→ Front : affiche "ARRÊTÉ — Stop-loss"
```
 
---
 
## 8. Messages Discord
 
```
✅ OFFRE [PAPER] | NomCollection
Prix: 0.180 ETH | Floor: 0.200 ETH (−10%)
Offres actives: 1/5 | WETH: 0.82 ETH | Expire: 24h
 
🎯 OFFRE ACCEPTÉE | NomCollection #5678
Acheté: 0.180 ETH → Listé: 0.200 ETH (floor)
Profit potentiel: +0.020 ETH (+11.1%)
 
🟢 SNIPE [PAPER] | NomCollection #1234
Acheté: 0.176 ETH (−12% floor) → Listé: 0.200 ETH
 
💰 VENDU | NomCollection #5678
0.180 → 0.200 ETH | P&L net: +0.017 ETH ✅
 
🔴 STOP-LOSS | Bot arrêté automatiquement
Perte: −0.16 ETH | Action requise sur le front.
```
 
---
 
## 9. Sécurité
 
```
1. Clé privée chiffrée AES-256-GCM — jamais en clair en DB ni dans les logs
2. ENCRYPTION_KEY uniquement dans .env (jamais en DB)
3. .env dans .gitignore AVANT le premier commit
4. JWT en httpOnly cookie (pas localStorage)
5. HTTPS : Vercel auto + Nginx + Certbot sur EC2
6. Rate limit : 10 req/min par IP sur toutes les routes API
7. CORS : uniquement le domaine Vercel autorisé
8. Ports EC2 publics : 80, 443, 22 UNIQUEMENT
9. PostgreSQL + bot-core : localhost uniquement, jamais exposés
10. Whitelist collections : bot trade UNIQUEMENT les collections configurées par l'user
```
 
---
 
## 10. Hébergement
 
| Phase | Front | Backend | Coût |
|-------|-------|---------|------|
| Test + Paper (mois 1-2) | Vercel free | EC2 t3.micro free tier | 0$/mois |
| Réel (mois 3+) | Vercel free | EC2 t3.small | ~15$/mois |
 
```bash
# Swap memory sur t3.micro — obligatoire
sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# PM2 — tous les processus
pm2 start apps/api/index.js       --name "trading-api"
pm2 start apps/bot-core/src/index.js --name "bot-core"
```

> Alerte budget AWS à 1$ obligatoire.
> PostgreSQL sur EC2 directement — pas RDS.
 
---
 
## 11. Ordre de développement
 
```
1.  Monorepo setup (npm workspaces + package.json racine)
2.  Prisma schema + migration PostgreSQL
3.  API : auth JWT (register/login) + middleware
4.  API : route wallet (AES-256 encrypt/decrypt)
5.  API : routes collections + config bot
6.  API : routes offers + trades + pnl + bot control
7.  bot-core : data layer (Reservoir WebSocket + floor + gas)
8.  bot-core : walletEngine (charge wallets depuis DB)
9.  bot-core : offerEngine + listEngine
10. bot-core : buyEngine (snipe)
11. bot-core : riskManager + stop-loss
12. bot-discord : module notify (webhook par user)
13. frontend : login + register
14. frontend : dashboard (P&L + status + config wallet + collections)
15. frontend : /offers
16. frontend : /trades
17. Tests paper trading 14 jours
18. Passage en réel
```
 
---
 
## 12. Critères go/no-go paper trading → réel
 
- [ ] P&L simulé positif sur 14 jours consécutifs
- [ ] Win rate > 60%
- [ ] Gas simulé < 30% du profit brut
- [ ] Bot actif 24/7 sans crash
- [ ] Timeout sell < 20% des trades
- [ ] Stop-loss déclenché correctement en simulation
- [ ] Aucune clé privée visible dans les logs
