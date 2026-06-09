# README_SESSION — TrackAudit

> Fichier de reprise de contexte — généré automatiquement le 2026-06-09 17:48:40
>
> **Phrase magique de reprise :**
> `Lis README_SESSION.md dans malik-aliti/Tracking-audit-tool- et reprends le contexte TrackAudit`

---

## Projet

**TrackAudit** — Application web de diagnostic de tracking : RGPD, Consent Mode v2, GA4,
Google Ads Enhanced Conversions, Meta Advanced Matching, CAPI.

- **Repo :** `malik-aliti/Tracking-audit-tool-`
- **Stack :** Next.js 14 · TypeScript · Tailwind CSS · `@anthropic-ai/sdk`
- **Déploiement :** Vercel

---

## État courant

| Champ | Valeur |
|-------|--------|
| Branche | `main` |
| Dernier commit | `f1c29960` — fix: session hook writes locally only, --push flag for explicit GitHub sync |
| Date | 2026-06-09 |
| Mis à jour | 2026-06-09 17:48:40 |

### Fichiers modifiés dans le dernier commit

- `.claude/commands/session.md`
- `scripts/update_session.py`

### 10 derniers commits

- `f1c2996 fix: session hook writes locally only, --push flag for explicit GitHub sync`
- `d3a31f3 chore: update session context`
- `40725f6 fix: wire Puppeteer scanner + fix AI model ID`
- `530f901 fix: OAuth connections persist across redirects + GTM data wired to analyze`
- `0409788 feat: session management system — /session command, post-commit hook, README_SESSION.md`
- `0fc7bd0 feat: src/app/App.tsx`
- `5cba503 fix: next.config.js`
- `8f67a5f fix: src/app/page.tsx`
- `01aa371 fix: package.json`
- `dcb815e fix: src/app/App.tsx`

---

## Architecture

### Routes API (`src/app/api/`)

- `src/app/api/analyze/route.ts`
- `src/app/api/google/callback/route.ts`
- `src/app/api/google/ga4/route.ts`
- `src/app/api/google/gtm/route.ts`
- `src/app/api/google/route.ts`
- `src/app/api/inject/route.ts`
- `src/app/api/meta/callback/route.ts`
- `src/app/api/meta/pixel/route.ts`
- `src/app/api/meta/route.ts`
- `src/app/api/scan/route.ts`

### Bibliothèques (`src/lib/`)

- `src/lib/analyzer.ts`
- `src/lib/gtm.ts`
- `src/lib/platforms.ts`
- `src/lib/scanner.ts`

### Dépendances clés

- `@anthropic-ai/sdk`: `^0.27.0`
- `@sparticuz/chromium`: `^149.0.0`
- `googleapis`: `^140.0.0`
- `next`: `14.2.29`
- `puppeteer-core`: `^25.1.0`
- `react`: `^18.3.1`
- `react-dom`: `^18.3.1`

---

## Variables d'environnement requises

| Variable | Usage |
|----------|-------|
| `ANTHROPIC_API_KEY` | Analyse IA des configurations tracking |
| `NEXT_PUBLIC_BASE_URL` | URL de base de l'app (Vercel) |
| `GOOGLE_CLIENT_ID` | OAuth Google pour GA4 / Google Ads |
| `GOOGLE_CLIENT_SECRET` | OAuth Google |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | API Google Ads |
| `META_APP_ID` | API Meta CAPI |
| `META_APP_SECRET` | API Meta |

---

## TODOs / Points d'attention

- (aucun TODO détecté)

---

## Comment reprendre dans une nouvelle conversation

Colle cette phrase dans Claude.ai :

> `Lis README_SESSION.md dans malik-aliti/Tracking-audit-tool- et reprends le contexte TrackAudit`

---

*Généré par `scripts/update_session.py` — hook git post-commit + commande `/session` Claude Code*
