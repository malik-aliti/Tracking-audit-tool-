#!/usr/bin/env python3
"""
update_session.py — Met à jour README_SESSION.md sur GitHub après chaque commit.
Appelé par le hook git post-commit et par la commande /session de Claude Code.
"""

import os
import sys
import json
import base64
import subprocess
import urllib.request
import urllib.error
from datetime import datetime
from pathlib import Path


REPO_OWNER = "malik-aliti"
REPO_NAME = "Tracking-audit-tool-"
GITHUB_REPO = f"{REPO_OWNER}/{REPO_NAME}"
SESSION_FILE = "README_SESSION.md"
TOKEN_PATH = os.path.expanduser("~/.trackaudit_token")


def repo_root() -> Path:
    result = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        raise RuntimeError("Pas dans un repo git")
    return Path(result.stdout.strip())


def git(*args, cwd: str = None) -> str:
    result = subprocess.run(
        ["git"] + list(args),
        capture_output=True, text=True, cwd=cwd
    )
    return result.stdout.strip()


def read_token() -> str:
    if not os.path.exists(TOKEN_PATH):
        raise FileNotFoundError(f"Token introuvable : {TOKEN_PATH}")
    return Path(TOKEN_PATH).read_text().strip()


def github_request(method: str, path: str, token: str, data: dict = None):
    url = f"https://api.github.com{path}"
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "User-Agent": "TrackAudit-SessionBot/1.0",
    }
    body = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        body_err = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"GitHub API {e.code}: {body_err}") from e


def get_file_sha(token: str) -> str | None:
    data = github_request("GET", f"/repos/{GITHUB_REPO}/contents/{SESSION_FILE}", token)
    return data.get("sha") if data else None


def push_file(token: str, content: str, sha: str = None):
    payload = {
        "message": "chore: update session context [auto]",
        "content": base64.b64encode(content.encode("utf-8")).decode(),
    }
    if sha:
        payload["sha"] = sha
    github_request("PUT", f"/repos/{GITHUB_REPO}/contents/{SESSION_FILE}", token, payload)


def collect_state(root: Path) -> dict:
    def g(*args):
        return git(*args, cwd=str(root))

    branch = g("branch", "--show-current")
    last_commit = g("log", "-1", "--format=%H|%s|%ci|%an")

    # Fichiers du dernier commit (compatible single-commit)
    num_commits = len(g("log", "--oneline").splitlines())
    if num_commits >= 2:
        changed = g("diff", "--name-only", "HEAD~1", "HEAD")
    else:
        changed = g("show", "--name-only", "--pretty=format:", "HEAD")

    recent_commits = g("log", "--oneline", "-10")

    # Routes API
    api_routes = []
    api_dir = root / "src" / "app" / "api"
    if api_dir.exists():
        for f in sorted(api_dir.rglob("route.ts")):
            api_routes.append(str(f.relative_to(root)))

    # Lib files
    lib_files = []
    lib_dir = root / "src" / "lib"
    if lib_dir.exists():
        for f in sorted(lib_dir.rglob("*.ts")):
            lib_files.append(str(f.relative_to(root)))

    # Dependencies
    pkg_path = root / "package.json"
    deps = {}
    if pkg_path.exists():
        deps = json.loads(pkg_path.read_text()).get("dependencies", {})

    # TODOs (git grep retourne 1 si aucun résultat — on ignore le code retour)
    todos_result = subprocess.run(
        ["git", "grep", "-n", r"TODO\|FIXME\|HACK", "--", "*.ts", "*.tsx"],
        capture_output=True, text=True, cwd=str(root)
    )
    todos = todos_result.stdout.strip()

    return {
        "branch": branch,
        "last_commit": last_commit,
        "changed": changed,
        "recent_commits": recent_commits,
        "api_routes": api_routes,
        "lib_files": lib_files,
        "deps": deps,
        "todos": todos,
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }


def build_readme(s: dict) -> str:
    parts = s["last_commit"].split("|")
    commit_hash = parts[0][:8] if parts else "?"
    commit_msg  = parts[1] if len(parts) > 1 else "?"
    commit_date = parts[2][:10] if len(parts) > 2 else "?"

    def bullet_list(lines):
        items = [f"- `{l}`" for l in lines if l]
        return "\n".join(items) if items else "- (aucun)"

    changed_str  = bullet_list(s["changed"].splitlines())
    commits_str  = bullet_list(s["recent_commits"].splitlines())
    routes_str   = bullet_list(s["api_routes"])
    lib_str      = bullet_list(s["lib_files"])
    deps_str     = "\n".join(f"- `{k}`: `{v}`" for k, v in s["deps"].items())

    todo_lines   = [l for l in s["todos"].splitlines() if l][:10]
    todos_str    = bullet_list(todo_lines) if todo_lines else "- (aucun TODO détecté)"

    return f"""# README_SESSION — TrackAudit

> Fichier de reprise de contexte — généré automatiquement le {s["timestamp"]}
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
| Branche | `{s["branch"]}` |
| Dernier commit | `{commit_hash}` — {commit_msg} |
| Date | {commit_date} |
| Mis à jour | {s["timestamp"]} |

### Fichiers modifiés dans le dernier commit

{changed_str}

### 10 derniers commits

{commits_str}

---

## Architecture

### Routes API (`src/app/api/`)

{routes_str}

### Bibliothèques (`src/lib/`)

{lib_str}

### Dépendances clés

{deps_str}

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

{todos_str}

---

## Comment reprendre dans une nouvelle conversation

Colle cette phrase dans Claude.ai :

> `Lis README_SESSION.md dans malik-aliti/Tracking-audit-tool- et reprends le contexte TrackAudit`

---

*Généré par `scripts/update_session.py` — hook git post-commit + commande `/session` Claude Code*
"""


def main():
    # --push : écrit localement ET pousse via API GitHub (crée un commit remote)
    # sans flag : écrit localement seulement (utilisé par le hook post-commit)
    push = "--push" in sys.argv

    try:
        root = repo_root()
        print(f"[session] Repo : {root}")

        state = collect_state(root)
        print(f"[session] État collecté ✓  (branche : {state['branch']})")

        content = build_readme(state)

        # Écriture locale (toujours)
        (root / SESSION_FILE).write_text(content, encoding="utf-8")
        print(f"[session] {SESSION_FILE} écrit localement ✓")

        if push:
            # Commit + push via git normal (pas d'API — évite la divergence)
            subprocess.run(["git", "add", SESSION_FILE], cwd=str(root), capture_output=True)
            has_change = subprocess.run(
                ["git", "diff", "--cached", "--quiet", SESSION_FILE],
                cwd=str(root)
            ).returncode != 0
            if has_change:
                env = {**os.environ, "GIT_HOOK_NO_SESSION": "1"}
                subprocess.run(
                    ["git", "commit", "-m", "chore: update session [auto]"],
                    cwd=str(root), env=env, capture_output=True
                )
            subprocess.run(["git", "push", "origin", "main"], cwd=str(root))
            print(f"[session] {SESSION_FILE} poussé sur GitHub ✓")
            print(f"\n✅ https://github.com/{GITHUB_REPO}/blob/main/{SESSION_FILE}")
            print("\nPhrase de reprise :")
            print("  Lis README_SESSION.md dans malik-aliti/Tracking-audit-tool- et reprends le contexte TrackAudit")
        else:
            print(f"[session] Mode hook — {SESSION_FILE} mis à jour localement (pas de push)")

    except Exception as e:
        print(f"[session] ERREUR : {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
