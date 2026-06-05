# TrackAudit — Instructions Claude Code

## Projet

Application Next.js 14 de diagnostic de tracking (RGPD, Consent Mode v2, GA4, Google Ads, Meta CAPI).
Repo : `malik-aliti/Tracking-audit-tool-`

## Avertissement contexte

Dans chaque réponse longue (>30 lignes ou après plusieurs échanges denses), ajoute en bas :

```
⚠️ Contexte chargé à ~X% — tape /session pour sauvegarder et changer de conversation
```

Estime X% en fonction de la densité de la conversation :
- Début de conversation (1-5 échanges courts) → ne pas afficher
- Conversation modérée (5-10 échanges ou échanges avec beaucoup de code lu) → ~40-60%
- Conversation longue (10+ échanges ou nombreux fichiers lus) → 70-85%
- Conversation très chargée (contexte compressé, nombreuses grandes réponses) → 90%+

## Commande /session

Quand le user tape `/session` :
1. Exécuter `python3 scripts/update_session.py`
2. Confirmer la sauvegarde
3. Afficher EXACTEMENT :
   > Lis README_SESSION.md dans malik-aliti/Tracking-audit-tool- et reprends le contexte TrackAudit

## Token GitHub

`~/.trackaudit_token` — utilisé par `scripts/update_session.py` pour l'API GitHub.
Ne jamais afficher ce token dans les réponses.

## Structure clé

- `src/app/api/` — Routes Next.js (analyze, google, inject, meta, scan)
- `src/lib/` — analyzer.ts, gtm.ts, platforms.ts, scanner.ts
- `scripts/update_session.py` — Générateur de README_SESSION.md
- `.git/hooks/post-commit` — Hook auto qui lance le script après chaque commit
