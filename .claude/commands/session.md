---
description: Sauvegarde le contexte de session sur GitHub et affiche la phrase de reprise
---

Exécute ces étapes dans l'ordre pour sauvegarder la session TrackAudit :

1. Lance la commande Bash suivante et attends la fin complète :
   ```
   python3 scripts/update_session.py --push
   ```

2. Vérifie que la sortie contient "poussé sur GitHub ✓". Si le script échoue, diagnostique et corrige l'erreur avant de relancer.

3. Confirme brièvement ce qui a été sauvegardé (branche, dernier commit, timestamp).

4. Affiche EXACTEMENT ce bloc (sans modification, sans paraphrase) :

---
**Pour reprendre dans une nouvelle conversation, colle cette phrase dans Claude.ai :**

> Lis README_SESSION.md dans malik-aliti/Tracking-audit-tool- et reprends le contexte TrackAudit
---
