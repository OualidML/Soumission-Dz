# ⚡ SoumissionAI-DZ — Multi-Agent Algerian Public Procurement & Tender Auditor (Loi n° 23-12)

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Model: Google Gemma 4](https://img.shields.io/badge/Model-Gemma_4_26B--A4B_MoE-emerald.svg)](https://ai.google.dev/)
[![Framework: Next.js 14](https://img.shields.io/badge/Framework-Next.js_14-black.svg)](https://nextjs.org/)
[![Track: MLH Hacktoberfest](https://img.shields.io/badge/Track-Open_Source_AI-orange.svg)](https://hacktoberfest.com/)
[![Standard: Modular SKILL.md](https://img.shields.io/badge/Agents-Modular_SKILL.md-cyan.svg)](./skills)

> **Système Multi-Agents d'Audit et de Conformité des Cahiers des Charges Algériens (BOMOP & BAOSEM) propulsé par le modèle ouvert Google Gemma 4 et le standard d'Agents Modulaires `SKILL.md`.**

---

## 🎯 Le Problème Résolu (The Problem Solved)

En Algérie, plus de **40% des soumissions aux marchés publics** (BOMOP et avis d'appels d'offres BAOSEM - Sonelgaz, Sonatrach, Ministères, CHU) sont **rejetées sans évaluation technique approfondie** lors de la phase préliminaire d'ouverture des plis par la **Commission d'Ouverture des Plis et d'Évaluation des Offres (COPEO)**.

Les causes majeures d'élimination sont évitables :
1. **Vices administratifs de forme (Article 47 de la Loi n° 23-12)** : Pièces manquantes ou mal réparties entre les 3 enveloppes réglementaires (*Dossier de Candidature*, *Offre Technique*, *Offre Financière*), absence de mentions manuscrites obligatoires (*"Lu et accepté"*), ou défaut d'attestations sociales (CNAS, CASNOS, CACOBATPH).
2. **Méconnaissance des dispenses Start-up (Article 87 de la Loi n° 23-12)** : Les jeunes entreprises innovantes labellisées sont souvent rejetées à tort pour absence de bilans triennaux certifiés ou de références similaires, alors que la loi les en dispense expressément.
3. **Erreurs arithmétiques dans le Bordereau des Prix Unitaires (BPU / DQE)** : Divergences entre quantités et prix unitaires HT, ou mauvaise application des taux de TVA algériens (19% standard vs 9% réduit pour le solaire ou le médical). En vertu de l'article 72, la COPEO rectifie d'office les totaux ou disqualifie le soumissionnaire.

**SoumissionAI-DZ** résout définitivement ce problème en automatisant l'audit avant le scellement des enveloppes.

---

## 🧠 Best Use of Gemma 4 Architecture

SoumissionAI-DZ tire parti des capacités de pointe du modèle open-weight de Google **`gemma-4-26b-a4b-it`** (sous licence Apache-2.0) à travers une architecture agentique dual-pass :

```
                               ┌────────────────────────────────────────────────────────┐
                               │               Raw Tender Document (CPS)                │
                               │          + Company Profile (SPA / Start-up)            │
                               └──────────────────────────┬─────────────────────────────┘
                                                          │
                                                          ▼
                               ┌────────────────────────────────────────────────────────┐
                               │   Deterministic BPU Math Engine (Pure TypeScript)      │
                               │   - Audit Qty * PU vs Claimed Total (Zero Hallucination)│
                               │   - Catch LOT-03 1,000,000 DA arithmetic discrepancy   │
                               │   - Validate 9% / 19% Algerian TVA & Total TTC (DZD)   │
                               └──────────────────────────┬─────────────────────────────┘
                                                          │
                                                          ▼
                               ┌────────────────────────────────────────────────────────┐
                               │   AGENT PASS 1: Legal Extractor & Mémoire Drafter      │
                               │   - Skill: skills/dz-law2312-extractor/SKILL.md        │
                               │   - Model: Google Gemma 4 26B-A4B MoE                  │
                               │   - Native CoT extraction: parts.find(p => p.thought)  │
                               │   - 3-Envelope Loi 23-12 Art. 47 Categorization        │
                               │   - Drafts formal French Mémoire Technique Justificatif │
                               └──────────────────────────┬─────────────────────────────┘
                                                          │
                                                          ▼
                               ┌────────────────────────────────────────────────────────┐
                               │   AGENT PASS 2: Adversarial COPEO Disqualification     │
                               │   - Skill: skills/commission-rejection-critic/SKILL.md │
                               │   - Model: Google Gemma 4 (Critic Mode)                │
                               │   - Strict 15% Elimination Risk Safety Boundary        │
                               │   - Flags Fatal Traps (e.g., missing ISO 14001:2015)   │
                               │   - Applies Art. 87 Startup Law Exemptions             │
                               └──────────────────────────┬─────────────────────────────┘
                                                          │
                                                          ▼
                               ┌────────────────────────────────────────────────────────┐
                               │        High-Impact Cyberpunk Enterprise Dashboard      │
                               │       (Next.js 14 + Tailwind CSS + Lucide Icons)       │
                               └────────────────────────────────────────────────────────┘
```

### 1. Extraction Native du Chain-of-Thought Gemma 4 (`thought: true`)
Gemma 4 intègre un raisonnement interne natif. Notre client backend ([`src/lib/gemma-client.ts`](./src/lib/gemma-client.ts)) implémente la règle de séparation stricte :
```typescript
// Extraction de la trace de pensée interne Gemma 4
const thoughtTrace = parts.find((p: any) => p.thought === true)?.text || "";

// Extraction du texte final nettoyé
const finalText = stripMarkdownFences(
  parts.filter((p: any) => !p.thought).map((p: any) => p.text).join("\n")
);
```

### 2. Résilience Multi-Niveaux (3-Tier Failover)
Pour garantir une disponibilité de 100% lors des démonstrations et en conditions réseau instables :
1. **Niveau 1 (Direct)** : Google AI Studio (`gemma-4-26b-a4b-it`) avec retry automatique 1x sur erreur 500/429.
2. **Niveau 2 (Cloud Failover)** : OpenRouter API (`OPENROUTER_API_KEY`) avec le modèle Gemma 4.
3. **Niveau 3 (Local Deterministic Fallback)** : Moteur d'analyse local expert sous Loi n° 23-12 s'exécutant instantanément sans jamais planter l'interface.

### 3. Pipeline Séquentiel Zéro-Contradiction & Téléversement PDF en Direct
- **Extraction PDF 100% Client-Side** ([`src/components/DocumentUploader.tsx`](./src/components/DocumentUploader.tsx)) : Utilise dynamiquement `pdf.js` côté navigateur avec décodeur de secours en flux binaire. Zéro dépendance serveur lourde (`canvas`/`pdf-parse`) et zéro envoi de binaires bruts vers les LLMs.
- **Verrou Anti-Contradiction Pass 1 ➜ Math ➜ Pass 2** : Les pièces manquantes issues de l'Enveloppe A/B/C (Pass 1) et les anomalies arithmétiques du BPU (Étape 2) sont injectées directement dans le contexte du critique COPEO (Pass 2). Un post-verrou déterministe en TypeScript garantit 0% de contradiction entre tous les panneaux de l'interface.

---

## 🛠️ Best Open-Source AI Project: Le Standard `SKILL.md`

Toutes les compétences des agents sont découplées du code applicatif et stockées sous forme de fichiers modulaires dans le répertoire [`/skills`](./skills) conformément au standard `SKILL.md` :

| Compétence | Fichier | Rôle & Mandat Légal |
| :--- | :--- | :--- |
| **DZ Law 23-12 Extractor** | [`skills/dz-law2312-extractor/SKILL.md`](./skills/dz-law2312-extractor/SKILL.md) | Analyse le cahier des charges et ventile les exigences dans les **3 enveloppes légales de l'Article 47** (Candidature, Technique, Financière). Rédige le *Mémoire Technique Justificatif*. |
| **BPU Financial Auditor** | [`skills/bpu-financial-auditor/SKILL.md`](./skills/bpu-financial-auditor/SKILL.md) | Audite le Bordereau des Prix Unitaires (BPU) et le Détail Quantitatif et Estimatif (DQE) en Dinars Algériens (DZD). Valide la TVA (19% standard vs 9% réduit) et traque les erreurs d'addition (ex. l'écart de **1 000 000 DA** sur le LOT-03). |
| **COPEO Rejection Critic** | [`skills/commission-rejection-critic/SKILL.md`](./skills/commission-rejection-critic/SKILL.md) | Simule la Commission d'Ouverture des Plis. Applique la **règle asymétrique de sécurité des 15%** : si le risque d'élimination $\ge 15\%$, déclenchement de `CRITICAL_DISQUALIFICATION_WARNING`. |

Le module [`src/lib/skill-loader.ts`](./src/lib/skill-loader.ts) lit dynamiquement ces fichiers à l'exécution avec parsing YAML robuste (`js-yaml`).

---

## 🖥️ Dashboard Cyberpunk Enterprise

L'application offre une interface dark-mode inspirée des centres de commandement industriels :

1. **Bannière de Triage Sécurité COPEO (Seuil 15%)** :
   - Jauge dynamique de risque d'élimination (0% à 100%).
   - Alerte rouge clignotante `CRITICAL_DISQUALIFICATION_WARNING` dès 15% de risque.
   - Signalement des pièges fatals (ex. absence d'ISO 14001:2015 pour ADERFP) ou affichage en vert des dispenses accordées aux Start-ups (Article 87).
2. **Les 3 Enveloppes Réglementaires (Loi 23-12 Art. 47)** :
   - Onglets interactifs : *Dossier de Candidature*, *Offre Technique*, *Offre Financière*.
   - Checklists de conformité avec pastilles de statut (*Conforme*, *Non conforme*, *Dispense Art. 87*).
3. **Audit Arithmétique BPU & DQE (DZD / DA)** :
   - Tableau financier complet avec calcul de l'écart arithmétique.
   - Détection en rouge vif de l'erreur d'un million de dinars sur le LOT-03.
   - Récapitulatif : Total HT Déclaré vs Réel, TVA ventilée (9% & 19%) et Total TTC Général.
4. **Générateur de Mémoire Technique & Terminal Gemma 4** :
   - Mémoire technique complet prêt pour soumission avec boutons **Copier** et **Imprimer / PDF**.
   - Tiroir terminal cyber extensible affichant en temps réel la trace de raisonnement `thought: true` de Gemma 4 et les fichiers `SKILL.md` actifs.

---

## 🚀 Guide d'Installation Locale (Local Setup)

### Prérequis
- **Node.js** v18+ ou v20+ (recommandé v20.x ou v24.x)
- **NPM** ou **PNPM**

### 1. Cloner le Dépôt
```bash
git clone https://github.com/OualidML/Soumission-Dz.git
cd Soumission-Dz
```

### 2. Installer les Dépendances
```bash
npm install
```

### 3. Configurer les Variables d'Environnement
Copiez le fichier d'exemple et renseignez vos clés d'API :
```bash
cp .env.example .env.local
```

Éditez `.env.local` :
```env
# Clé Google AI Studio (Gemma 4)
GEMMA_API_KEY=votre_cle_google_ai_studio_ici
GEMMA_PRIMARY_MODEL=gemma-4-26b-a4b-it
GEMMA_CRITIC_MODEL=gemma-4-26b-a4b-it

# Clé de secours OpenRouter (Optionnelle)
OPENROUTER_API_KEY=votre_cle_openrouter_ici
OPENROUTER_MODEL=google/gemma-4-26b-a4b-it:free
```

> **Note :** Si aucune clé d'API n'est configurée ou si le réseau est coupé, l'application bascule automatiquement sur le **moteur déterministe local**, garantissant une démonstration 100% fonctionnelle sans plantage.

### 4. Lancer le Serveur de Développement
```bash
npm run dev
```
Ouvrez [http://localhost:3000](http://localhost:3000) dans votre navigateur.

### 5. Compiler pour la Production
```bash
npm run build
npm run start
```

---

## 🧪 Scénarios Démo 1-Click (Évaluation Rapide pour le Jury)

Le dashboard propose deux boutons d'évaluation rapide en haut de page :

1. **🔴 Scénario Rejet Sonelgaz (`ADERFP Green Energy SPA`)** :
   - **Cahier des charges :** BAOSEM N° 4108/2026/SKTM (Hybridation Solaire 500 kWc).
   - **Résultat de l'audit :** Risque d'élimination de **85%** ($\ge 15\%$).
   - **Pièges fatals détectés :** Absence de la certification ISO 14001:2015 (exigence éliminatoire) + Erreur arithmétique de **-1 000 000 DA** sur le LOT-03.
   - **Verdict COPEO :** Déclenchement immédiat de `CRITICAL_DISQUALIFICATION_WARNING`.

2. **🟢 Scénario Succès Start-up (`SolveTech AI SARL`)** :
   - **Cahier des charges :** Consultation N° 19/2026/CHU-CNE (Triage IA Médical).
   - **Résultat de l'audit :** Risque d'élimination résiduel de **4%** ($< 15\%$).
   - **Mesures appliquées :** Activation des dispenses de l'**Article 87 de la Loi n° 23-12** (exonération des 3 bilans financiers et des références antérieures grâce au Label Start-up).
   - **Verdict COPEO :** Dossier qualifié (`SAFE`) et Mémoire Technique généré avec succès.

---

## 📜 Licence Open-Source

Ce projet est distribué sous la licence **Apache-2.0**. Consultez le fichier [`LICENSE`](./LICENSE) pour plus de détails.

---

## 🤝 Crédits & Remerciements

- **Google DeepMind & Google AI Studio** pour la mise à disposition des modèles ouverts **Gemma 4**.
- **Major League Hacking (MLH)** pour l'organisation du Hacktoberfest Track.
- Développé avec passion pour moderniser et sécuriser l'accès à la commande publique en Algérie 🇩🇿.
