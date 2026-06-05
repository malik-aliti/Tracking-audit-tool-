# README_SESSION — TrackAudit

> Fichier de reprise de contexte — généré automatiquement le 2026-06-05 19:06:58
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
| Dernier commit | `530f901e` — fix: OAuth connections persist across redirects + GTM data wired to analyze |
| Date | 2026-06-05 |
| Mis à jour | 2026-06-05 19:06:58 |

### Fichiers modifiés dans le dernier commit

- `README_SESSION.md`
- `src/app/App.tsx`

### 10 derniers commits

- `530f901 fix: OAuth connections persist across redirects + GTM data wired to analyze`
- `0409788 feat: session management system — /session command, post-commit hook, README_SESSION.md`
- `0fc7bd0 feat: src/app/App.tsx`
- `5cba503 fix: next.config.js`
- `8f67a5f fix: src/app/page.tsx`
- `01aa371 fix: package.json`
- `dcb815e fix: src/app/App.tsx`
- `41acbb5 fix: src/app/page.tsx`
- `bbaf217 fix: src/app/App.tsx`
- `abb482c fix: src/app/page.tsx`

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

- `next`: `14.2.29`
- `react`: `^18.3.1`
- `react-dom`: `^18.3.1`
- `@anthropic-ai/sdk`: `^0.27.0`
- `googleapis`: `^140.0.0`

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
