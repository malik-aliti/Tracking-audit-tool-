# TrackAudit — Diagnostic de tracking complet

Application web de diagnostic de tracking : RGPD, Consent Mode v2, GA4, Google Ads Enhanced Conversions, Meta Advanced Matching, CAPI.

---

## 🚀 Déploiement en 15 minutes sur Vercel

### Étape 1 — Prérequis

- Compte [Vercel](https://vercel.com) (gratuit)
- Compte [GitHub](https://github.com) (pour héberger le code)
- Clé API Anthropic : [console.anthropic.com](https://console.anthropic.com)

### Étape 2 — Mettre le code sur GitHub

```bash
# Dans le dossier trackaudit
git init
git add .
git commit -m "Initial commit — TrackAudit"
git remote add origin https://github.com/VOTRE-USER/trackaudit.git
git push -u origin main
```

### Étape 3 — Déployer sur Vercel

1. Aller sur [vercel.com/new](https://vercel.com/new)
2. "Import Git Repository" → sélectionner `trackaudit`
3. **Ne pas déployer encore** — aller dans "Environment Variables" et ajouter :

| Variable | Valeur | Obligatoire |
|----------|--------|-------------|
| `ANTHROPIC_API_KEY` | `sk-ant-api03-...` | ✅ |
| `NEXT_PUBLIC_BASE_URL` | `https://votre-app.vercel.app` | ✅ |
| `GOOGLE_CLIENT_ID` | voir étape 4 | Pour GA4/Ads |
| `GOOGLE_CLIENT_SECRET` | voir étape 4 | Pour GA4/Ads |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | voir étape 5 | Pour Google Ads |
| `META_APP_ID` | voir étape 6 | Pour Meta |
| `META_APP_SECRET` | voir étape 6 | Pour Meta |

4. Cliquer "Deploy"

**Note importante** : après le premier déploiement, copier l'URL Vercel (ex: `trackaudit-abc123.vercel.app`) et mettre à jour `NEXT_PUBLIC_BASE_URL` dans les variables Vercel, puis redéployer.

---

## 🔵 Étape 4 — Configurer Google OAuth (GA4 + Google Ads)

### 4.1 Créer le projet Google Cloud

1. Aller sur [console.cloud.google.com](https://console.cloud.google.com)
2. "Nouveau projet" → nommer "TrackAudit"
3. Sélectionner le projet créé

### 4.2 Activer les APIs

Dans "APIs et services" → "Bibliothèque", activer :
- ✅ **Google Analytics Data API**
- ✅ **Google Analytics Admin API**
- ✅ **Google Ads API** *(optionnel, voir étape 5)*

### 4.3 Créer les identifiants OAuth

1. "APIs et services" → "Identifiants" → "Créer des identifiants" → "ID client OAuth 2.0"
2. Type : **Application Web**
3. Nom : `TrackAudit`
4. **URI de redirection autorisés** :
   - `http://localhost:3000/api/google/callback` (développement)
   - `https://votre-app.vercel.app/api/google/callback` (production)
5. Copier **Client ID** et **Client Secret** → ajouter dans Vercel

### 4.4 Écran de consentement OAuth

1. "APIs et services" → "Écran de consentement OAuth"
2. Type : **Externe** (pour que n'importe qui puisse se connecter)
3. Remplir nom d'application, email support
4. Scopes à ajouter :
   - `https://www.googleapis.com/auth/analytics.readonly`
   - `https://www.googleapis.com/auth/adwords`
5. Ajouter des utilisateurs test ou publier l'application

---

## ⚡ Étape 5 — Google Ads Developer Token (optionnel)

Pour accéder aux données Google Ads en production :

1. Se connecter à [Google Ads](https://ads.google.com)
2. Compte → Centre d'aide et support → API Google Ads → "Demander un token de développeur"
3. **Mode Test** disponible immédiatement (données limitées)
4. **Mode Production** nécessite une vérification par Google (quelques jours)
5. Copier le token → variable `GOOGLE_ADS_DEVELOPER_TOKEN`

---

## 🔷 Étape 6 — Configurer Meta OAuth (Pixel + CAPI)

### 6.1 Créer l'application Meta

1. Aller sur [developers.facebook.com](https://developers.facebook.com)
2. "Mes applications" → "Créer une application"
3. Type : **Business** → nom : `TrackAudit`

### 6.2 Ajouter les produits

Dans le tableau de bord de l'app :
1. **Facebook Login** → "Configurer"
   - URI de redirection OAuth valides :
     - `http://localhost:3000/api/meta/callback`
     - `https://votre-app.vercel.app/api/meta/callback`
2. **Marketing API** → "Configurer"

### 6.3 Permissions requises

Dans "Révision d'application" → "Permissions et fonctionnalités" :
- `ads_read`
- `business_management`
- `pages_read_engagement`

### 6.4 Récupérer les identifiants

"Paramètres" → "Informations de base" → copier **ID d'application** et **Clé secrète**

---

## 💻 Développement local

```bash
# Cloner / se placer dans le dossier
cd trackaudit

# Copier les variables d'environnement
cp .env.example .env.local
# Remplir .env.local avec vos valeurs

# Installer les dépendances
npm install

# Démarrer en développement
npm run dev
# → http://localhost:3000
```

**Prérequis local** : Chrome/Chromium installé
- macOS : Chrome installé par défaut via `brew install --cask google-chrome`
- Linux : `sudo apt install chromium-browser` puis `CHROME_PATH=/usr/bin/chromium-browser`
- Windows : Chrome installé, adapter `CHROME_PATH`

---

## 🏗️ Architecture

```
trackaudit/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Interface principale
│   │   ├── layout.tsx            # Layout racine
│   │   ├── globals.css           # Styles globaux
│   │   └── api/
│   │       ├── scan/route.ts     # Scan headless de l'URL
│   │       ├── analyze/route.ts  # Analyse IA (Claude)
│   │       ├── google/           # OAuth Google + GA4 + Ads
│   │       └── meta/             # OAuth Meta + Pixel
│   ├── lib/
│   │   ├── scanner.ts            # Engine Puppeteer
│   │   ├── analyzer.ts           # Engine d'analyse (30+ checks)
│   │   └── platforms.ts          # Intégrations API plateformes
│   └── types/index.ts            # Types TypeScript partagés
├── .env.example                  # Variables d'environnement
├── vercel.json                   # Configuration Vercel
└── README.md                     # Ce fichier
```

---

## 📋 Checks effectués (30+)

### 🔒 Consentement & RGPD
- CMP détectée et active (OneTrust, CookieYes, Didomi, Axeptio, Cookiebot, Usercentrics, Tarteaucitron)
- TCF v2.2 actif
- Consent Mode v2 — 4 paramètres définis (Mode Avancé vs Basique)
- Mise à jour du consentement transmise

### 🏷️ Taggage de base
- GTM chargé et actif
- GA4 Measurement ID détecté
- Meta Pixel actif (hors iFrame, sans doublon)
- Conversion Linker (cookies _gcl_*)
- Auto-tagging GCLID

### 📊 GA4 & Analytics
- Événements custom dans le dataLayer
- Paramètres UTM/GCLID dans l'URL
- Formulaires et CTAs trackés
- Micro-signaux (scroll, clics)
- Double page_view détecté

### ⚡ Google Ads
- Tag Google Ads présent
- Données first-party (user_data)
- Enhanced Conversions configuré (via API si connecté)
- Actions de conversion actives (via API si connecté)

### 🎯 Meta
- Advanced Matching (em/ph) détecté
- CAPI connectée
- Événements Meta configurés
- Double PageView Meta

### ✅ QA
- Erreurs JavaScript
- Double comptabilisation

---

## 🔮 Roadmap

- [ ] TikTok Ads API
- [ ] LinkedIn Ads API  
- [ ] Export PDF du rapport
- [ ] Historique des audits (base de données)
- [ ] Alertes email sur régression
- [ ] Mode comparaison avant/après
- [ ] Webhook pour monitoring continu

---

## 📄 Licence

MIT — Libre d'utilisation, modification et distribution.
