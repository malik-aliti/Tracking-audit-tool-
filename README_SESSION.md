# README_SESSION — TrackAudit

> Fichier de reprise de contexte — généré automatiquement le 2026-06-11 12:47:32
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
| Branche | `claude/nice-einstein-nkocsx` |
| Dernier commit | `089c77b2` — feat(analyzer): GTM-first architecture for all tracking checks |
| Date | 2026-06-11 |
| Mis à jour | 2026-06-11 12:47:32 |

### Fichiers modifiés dans le dernier commit

- `src/lib/analyzer.ts`

### 10 derniers commits

- `089c77b feat(analyzer): GTM-first architecture for all tracking checks`
- `f77b4d7 fix: détection template CMP GTM — supporte les community templates (cvt_)`
- `5727b0a chore: ignore tsconfig.tsbuildinfo build artifact`
- `bae7bc9 feat: Consent Mode v2 et template CMP vérifiés via GTM (source primaire)`
- `1341e93 fix: STATUS.fail icon key 'error' → 'x' (was undefined in icons map)`
- `25409e8 feat: UI/UX redesign v2 — SaaS-grade design (Meta BM / Linear / Stripe)`
- `d9c379f fix: import React for JSX.Element type in CAT_META`
- `4d27dd7 feat: redesign UI/UX — GAFAM-inspired design system`
- `58657a4 chore: update session [auto]`
- `a4b9496 fix: replace GitHub API push with native git push in session script`

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
