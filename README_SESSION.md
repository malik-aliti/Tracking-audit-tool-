# TrackAudit — Session Context
> Derniere mise a jour : 05 juin 2026
> Copier dans Project Knowledge Claude pour demarrer une nouvelle conversation avec tout le contexte

---

## BRIEF PRODUIT

Outil SaaS de diagnostic de tracking utilisable par tout site web.
Scan automatique d'une URL + connexion aux plateformes (GTM, GA4, Google Ads, Meta) + analyse IA 30+ checks.

Points d'analyse definis :
- RGPD / CMP (CookieYes, OneTrust, Didomi, Axeptio, Cookiebot, Tarteaucitron)
- Consent Mode v2 Mode Avance vs Basique, wait_for_update
- TCF v2.2
- GTM API : tags, triggers, variables, template Consent Mode, tags en pause/orphelins
- GA4 : Measurement ID, evenements custom, Enhanced Measurement, conversions
- Google Ads : Auto-tagging, Conversion Linker, Enhanced Conversions, user_data
- Meta : Pixel, Advanced Matching, CAPI server-side, match rate, double pixel
- Parcours utilisateur : CTAs, formulaires, micro-signaux scroll/clics
- QA : erreurs JS, UTMs, donnees first-party

---

## STACK TECHNIQUE

- Next.js 14.2.29 + React 18.3.1
- CRITIQUE : Ne pas upgrader vers Next.js 15.x (bug SSR fatal)
- Architecture : page.tsx wrapper (dynamic ssr:false) -> App.tsx (use client)
- IA : Claude Sonnet API (claude-sonnet-4-20250514)
- Deps : googleapis v140, @anthropic-ai/sdk v0.27
- Repo : malik-aliti/Tracking-audit-tool- (public, branche main)

---

## CONFIGURATION

Toutes les cles sont dans le fichier .env.local sur le Mac.
Ne jamais committer les valeurs sensibles dans GitHub.

Variables requises :
- ANTHROPIC_API_KEY
- NEXT_PUBLIC_BASE_URL (localhost:3000 en dev, URL Vercel en prod)
- GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
- META_APP_ID / META_APP_SECRET
- GOOGLE_ADS_DEVELOPER_TOKEN (vide, pas encore configure)

OAuth Google (projet GCP : ga-api-486915) : FONCTIONNEL
- Scopes : analytics.readonly + adwords + tagmanager.readonly + userinfo
- APIs activees : Analytics Data, Analytics Admin, Tag Manager

OAuth Meta (App TrackAudit) : FONCTIONNEL
- Scopes : ads_read, business_management, pages_read_engagement

---

## FONCTIONNEMENT

Mode 1 - Scan fetch (defaut) :
  URL -> /api/scan -> HTML -> detection statique GTM/GA4/Meta/CMP
  Limite : ne voit pas les scripts JS dynamiques
  Score typique : 40-50/100

Mode 2 - Injection navigateur (enrichi) :
  Claude in Chrome sur le vrai site -> window.__trackaudit(browserData)
  Voit : CookieYes, dataLayer, cookies, Consent Mode v2 reel, Meta Pixel
  Score typique : 60-70/100

Mode 3 - APIs plateformes (si OAuth connecte) :
  GA4 Data API + Tag Manager API + Google Ads API en parallele
  GTM checks : template Consent Mode, tags, triggers, variables

---

## ETAT AU 05/06/2026

FONCTIONNEL :
- App stable sur localhost:3000
- Scan fetch sur n'importe quelle URL
- Interface 30+ checks, plan de correction, onglet plateformes
- OAuth Google + Meta configures et testes
- GTM API implementee (src/lib/gtm.ts)
- Analyse IA avec resume Claude

A VALIDER :
- window.__trackaudit (a tester apres git reset --hard)
- GTM checks (reconnexion Google requise a chaque redemarrage, tokens non persistes)

TODO :
- Deploiement Vercel (PRIORITAIRE)
- Persistance tokens OAuth (sessionStorage apres OAuth callback)
- Export PDF rapport
- Multi-sites, historique audits
- TikTok Ads, LinkedIn Ads

---

## DEMARRER UNE SESSION

Terminal :
  cd ~/Tracking-audit-tool-
  git pull origin main
  npm run dev

Test window.__trackaudit dans console navigateur (localhost:3000) :
  window.__trackaudit({
    url:'https://weareoxo-digital.com/',
    gtmContainers:['GTM-MD9XQC9S'],
    ga4Ids:['G-T2BX8HLRVN'],
    metaPixelIds:['993896383378275'],
    cmpDetected:'CookieYes',
    hasTCF:false,
    consentDefault:{analytics_storage:'denied',ad_storage:'denied',
      ad_user_data:'denied',ad_personalization:'denied',wait_for_update:2000},
    consentUpdate:{analytics_storage:'granted',ad_storage:'granted',
      ad_user_data:'granted',ad_personalization:'granted'},
    cookies:['_ga','cookieyes-consent','_fbp','FPLC','_ga_T2BX8HLRVN'],
    hasGTM:true,hasGtag:true,hasFbq:true,hasCAPI:false,
    ctaElements:36,forms:[],jsErrors:[],pageType:'home',_source:'browser'
  })

---

## PROCHAINES ETAPES (ordre priorite)

1. DEPLOIEMENT VERCEL
   - vercel.com/new -> importer le repo GitHub
   - Ajouter toutes les variables env dans Vercel
   - Mettre a jour NEXT_PUBLIC_BASE_URL avec l'URL Vercel generee
   - Mettre a jour les URIs OAuth Google et Meta avec l'URL Vercel
   - Redeployer apres mise a jour de NEXT_PUBLIC_BASE_URL

2. PERSISTANCE TOKENS OAUTH
   - Utiliser sessionStorage (pas localStorage) dans un useEffect
   - Toujours verifier typeof window avant d'acceder au storage

3. TESTER INJECTION NAVIGATEUR
   - Ouvrir Claude in Chrome sur weareoxo-digital.com
   - Appeler window.__trackaudit avec les vraies donnees
   - Score attendu : 64/100 (vs 44 en fetch seul)

4. PHASE 2
   - Obtenir Google Ads Developer Token
   - Meta Ads insights
   - TikTok et LinkedIn Ads (phase suivante)

---

## AUDIT REFERENCE weareoxo-digital.com

Score fetch seul : 44/100
Score avec injection navigateur : 64/100

Donnees reelles du site :
- GTM : GTM-MD9XQC9S
- GA4 : G-T2BX8HLRVN
- Meta Pixel : 993896383378275
- CMP : CookieYes sans TCF v2.2
- Consent Mode v2 Mode Avance, wait_for_update 2000ms
- Cookies actifs : _ga, cookieyes-consent, _fbp, FPLC

Problemes critiques identifies :
1. 36 CTAs sans aucun evenement de conversion tracked
2. Advanced Matching Meta non configure (parametres em/ph absents)
3. CAPI Meta non connectee (20-40% conversions mobiles perdues)
4. Zero evenement custom dans dataLayer
5. TCF v2.2 absent

---

## BUGS RESOLUS (ne pas repeter)

localStorage SSR -> downgrade Next.js 14.2.29
ssr:false interdit Server Component -> 'use client' dans page.tsx
backslash-apostrophes dans analyzer.ts -> reecriture complete sans encodage Python
App crash -> rm -rf .next node_modules && npm install
Fichiers locaux desynchros -> git reset --hard origin/main

---

## STRUCTURE FICHIERS

src/app/page.tsx : wrapper dynamic import ssr:false (8 lignes)
src/app/App.tsx : toute l'app, use client, window.__trackaudit (~725 lignes)
src/app/api/scan/route.ts : scan fetch + normalize browserData
src/app/api/analyze/route.ts : checks + resume IA Claude
src/app/api/google/ga4/route.ts : GA4 + Google Ads + GTM en parallele
src/lib/gtm.ts : GTM API complete (~418 lignes)
src/lib/analyzer.ts : 30+ checks et scoring (~392 lignes)
src/lib/platforms.ts : OAuth + fetch GA4/Meta (~171 lignes)
src/types/index.ts : types TypeScript (~119 lignes)

---

## ROADMAP 5 PHASES

Phase 1 OK  : Diagnostic tracking complet
Phase 2     : APIs enrichies GTM + Google Ads + TikTok/LinkedIn
Phase 3     : Analyse campagnes paid (ROAS, CPA, anomalies)
Phase 4     : Traffic & leads (entonnoirs, cohortes, alertes)
Phase 5     : SaaS public (auth Supabase, freemium, historique, PDF)
