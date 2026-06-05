#!/usr/bin/env python3
"""
update_session.py — Générateur automatique de contexte de session TrackAudit
Usage : python3 update_session.py
Pushe README_SESSION.md dans le repo GitHub avec l'état actuel du projet.
À appeler en fin de session ou quand la conversation devient trop longue.
"""

import subprocess, os, base64, json, urllib.request, urllib.error
from datetime import datetime

# Token lu depuis variable env ou .env.local
import re as _re
_TOKEN_FILE = os.path.expanduser("~/.trackaudit_token")
TOKEN = os.environ.get("GITHUB_TOKEN", "")
if not TOKEN and os.path.exists(_TOKEN_FILE):
    TOKEN = open(_TOKEN_FILE).read().strip()
if not TOKEN:
    # Chercher dans .env.local
    try:
        _env = open(".env.local").read()
        _m = _re.search(r"GITHUB_TOKEN=(.+)", _env)
        if _m: TOKEN = _m.group(1).strip()
    except: pass
if not TOKEN:
    print("ERREUR: GITHUB_TOKEN non trouve.")
    print("Ajouter dans ~/.trackaudit_token ou variable env GITHUB_TOKEN")
    exit(1)
REPO  = "malik-aliti/Tracking-audit-tool-"
BRANCH = "main"
HEADERS = {
    "Authorization": f"token {TOKEN}",
    "Accept": "application/vnd.github.v3+json",
    "Content-Type": "application/json"
}

def run(cmd):
    try:
        return subprocess.check_output(cmd, shell=True, text=True, stderr=subprocess.DEVNULL).strip()
    except:
        return ""

def get_sha(path):
    try:
        req = urllib.request.Request(
            f"https://api.github.com/repos/{REPO}/contents/{path}", headers=HEADERS)
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read()).get("sha")
    except:
        return None

def push(path, content):
    sha = get_sha(path)
    data = {
        "message": f"chore: auto-update {path} [{datetime.now().strftime('%Y-%m-%d %H:%M')}]",
        "content": base64.b64encode(content.encode()).decode(),
        "branch": BRANCH
    }
    if sha:
        data["sha"] = sha
    req = urllib.request.Request(
        f"https://api.github.com/repos/{REPO}/contents/{path}",
        data=json.dumps(data).encode(), headers=HEADERS, method="PUT"
    )
    try:
        with urllib.request.urlopen(req) as r:
            result = json.loads(r.read())
            print(f"✓ {path} pushé")
            return True
    except urllib.error.HTTPError as e:
        print(f"✗ Erreur {e.code}: {e.read().decode()[:200]}")
        return False

def collect_state():
    """Collecte l'état actuel du projet depuis le filesystem et git"""
    state = {}
    
    # Git info
    state["last_commit"] = run("git log -1 --format='%h %s %ci'")
    state["branch"] = run("git rev-parse --abbrev-ref HEAD")
    state["changed_files"] = run("git diff --name-only HEAD~5 HEAD 2>/dev/null | head -20")
    
    # Package.json
    try:
        with open("package.json") as f:
            pkg = json.load(f)
        state["next_version"] = pkg.get("dependencies", {}).get("next", "?")
        state["react_version"] = pkg.get("dependencies", {}).get("react", "?")
    except:
        state["next_version"] = "?"
        state["react_version"] = "?"
    
    # Fichiers existants
    state["files"] = run("find src -name '*.ts' -o -name '*.tsx' | sort")
    
    # Taille des fichiers clés
    file_sizes = {}
    for f in ["src/app/App.tsx", "src/lib/analyzer.ts", "src/lib/gtm.ts", "src/lib/platforms.ts"]:
        try:
            lines = len(open(f).readlines())
            file_sizes[f] = f"{lines} lignes"
        except:
            file_sizes[f] = "absent"
    state["file_sizes"] = file_sizes
    
    return state

def generate_readme(state):
    now = datetime.now().strftime("%d/%m/%Y %H:%M")
    
    return f"""# TrackAudit — Session Context
> Mis a jour automatiquement le {now}
> Copier dans Project Knowledge Claude pour demarrer une nouvelle conversation

## BRIEF PRODUIT

Outil SaaS de diagnostic de tracking utilisable par tout site web.
Scan automatique URL + connexion plateformes (GTM, GA4, Google Ads, Meta) + analyse IA 30+ checks.

Points d'analyse : RGPD/CMP, Consent Mode v2 Avance/Basique, TCF v2.2, GTM API (tags/triggers/variables),
GA4, Google Ads Enhanced Conversions, Meta Pixel/CAPI/Advanced Matching, parcours utilisateur, QA JS.

## STACK TECHNIQUE

- Next.js {state['next_version']} + React {state['react_version']}
- CRITIQUE : Ne pas upgrader vers Next.js 15.x (bug SSR --localstorage-file fatal)
- Architecture : page.tsx wrapper (dynamic ssr:false) -> App.tsx ('use client')
- IA : Claude Sonnet API claude-sonnet-4-20250514
- Repo : malik-aliti/Tracking-audit-tool- (public, branche {state['branch']})
- Dernier commit : {state['last_commit']}

## TAILLE FICHIERS CLES

{chr(10).join(f"- {k} : {v}" for k, v in state['file_sizes'].items())}

## CONFIGURATION

Variables dans .env.local (ne jamais committer les valeurs) :
- ANTHROPIC_API_KEY
- NEXT_PUBLIC_BASE_URL (localhost:3000 en dev, URL Vercel en prod)
- GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
- META_APP_ID / META_APP_SECRET
- GOOGLE_ADS_DEVELOPER_TOKEN (vide, non configure)

OAuth Google (projet GCP ga-api-486915) : FONCTIONNEL
- Scopes : analytics.readonly + adwords + tagmanager.readonly + userinfo
- APIs : Analytics Data, Analytics Admin, Tag Manager

OAuth Meta (App TrackAudit) : FONCTIONNEL
- Scopes : ads_read, business_management, pages_read_engagement

## FONCTIONNEMENT

Mode 1 - Scan fetch (defaut) :
  URL -> /api/scan -> HTML -> detection statique. Score ~44/100.

Mode 2 - Injection navigateur (enrichi) :
  Claude in Chrome -> window.__trackaudit(browserData). Score ~64/100.
  Permet de voir : CookieYes, Consent Mode v2, cookies reels, dataLayer, Meta Pixel.

Mode 3 - APIs plateformes (OAuth connecte) :
  GA4 Data API + Tag Manager API + Google Ads API en parallele.

## ETAT ACTUEL

FONCTIONNEL :
- App stable localhost:3000
- Scan fetch sur n'importe quelle URL
- Interface 30+ checks, plan de correction, onglet plateformes
- OAuth Google + Meta configures et testes
- GTM API implementee dans src/lib/gtm.ts
- Analyse IA avec resume Claude

A VALIDER :
- window.__trackaudit (tester depuis console navigateur)
- GTM checks (reconnexion Google requise a chaque redemarrage)

TODO :
- Deploiement Vercel (PRIORITAIRE)
- Persistance tokens OAuth avec sessionStorage
- Export PDF rapport
- Multi-sites, historique audits, TikTok/LinkedIn Ads

## DEMARRER UNE SESSION

Terminal :
  cd ~/Tracking-audit-tool-
  git pull origin main
  npm run dev

Test window.__trackaudit dans console navigateur sur localhost:3000 :
  window.__trackaudit({{
    url:'https://weareoxo-digital.com/',
    gtmContainers:['GTM-MD9XQC9S'], ga4Ids:['G-T2BX8HLRVN'],
    metaPixelIds:['993896383378275'], cmpDetected:'CookieYes', hasTCF:false,
    consentDefault:{{analytics_storage:'denied',ad_storage:'denied',
      ad_user_data:'denied',ad_personalization:'denied',wait_for_update:2000}},
    consentUpdate:{{analytics_storage:'granted',ad_storage:'granted',
      ad_user_data:'granted',ad_personalization:'granted'}},
    cookies:['_ga','cookieyes-consent','_fbp','FPLC'],
    hasGTM:true,hasGtag:true,hasFbq:true,hasCAPI:false,
    ctaElements:36,forms:[],jsErrors:[],pageType:'home',_source:'browser'
  }})

Mettre a jour le session context en fin de session :
  python3 update_session.py

## PROCHAINES ETAPES (priorite)

1. Deploiement Vercel :
   vercel.com/new -> importer le repo -> configurer variables env ->
   mettre a jour NEXT_PUBLIC_BASE_URL -> mettre a jour URIs OAuth -> redeployer

2. Persistance tokens OAuth :
   sessionStorage dans useEffect avec typeof window check

3. Tester injection navigateur :
   Claude in Chrome sur weareoxo-digital.com -> appeler window.__trackaudit

4. Phase 2 - APIs enrichies :
   Google Ads Developer Token + Meta Ads insights

## AUDIT REFERENCE weareoxo-digital.com

Fetch : 44/100 | Injection navigateur : 64/100
Donnees : GTM-MD9XQC9S, G-T2BX8HLRVN, Pixel 993896383378275, CookieYes Mode Avance wait_for_update:2000ms
Problemes : 36 CTAs sans tracking, Advanced Matching Meta absent, CAPI non connectee, 0 evenements custom

## BUGS RESOLUS (ne pas repeter)

- localStorage SSR -> downgrade Next.js 14.2.29
- ssr:false interdit Server Component -> 'use client' dans page.tsx
- backslash-apostrophes analyzer.ts -> reecriture propre
- App crash -> rm -rf .next node_modules && npm install
- Fichiers desynchros -> git reset --hard origin/main

## ROADMAP

Phase 1 OK  : Diagnostic tracking complet
Phase 2     : APIs enrichies GTM + Google Ads + TikTok/LinkedIn
Phase 3     : Analyse paid (ROAS, CPA, anomalies)
Phase 4     : Traffic & leads (entonnoirs, cohortes, alertes)
Phase 5     : SaaS (auth Supabase, freemium, historique, PDF)
"""

if __name__ == "__main__":
    print("Collecte de l'etat du projet...")
    state = collect_state()
    print("Generation du README_SESSION.md...")
    content = generate_readme(state)
    print("Push vers GitHub...")
    push("README_SESSION.md", content)
    print("\nDone. Copier README_SESSION.md dans Project Knowledge Claude pour la prochaine session.")
