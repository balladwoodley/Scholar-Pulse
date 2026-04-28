# Scholar Pulse

> Deconstruct the academic ego. Read an arXiv researcher like a research report.

Scholar Pulse pulls a researcher's recent arXiv papers and scores them across three energy layers — **Oracle** (thesis/framing), **Engineer** (mechanism/code), and **Scout** (exploratory/speculative) — to produce a first-pass "theory of mind" of their publication surface.

---

## What it does

Traditional metrics stop at citation counts and h-index. Scholar Pulse looks at *intent*. It asks: is this researcher defining a field, building its infrastructure, or prototyping its future?

### The Signal Mix

| Layer | What it measures |
|-------|-----------------|
| ✨ **Oracle** | Strategic framing, alignment language, foundational invariants. The "why" and theoretical boundaries. |
| ⚙️ **Engineer** | Utility and implementation. Verified by benchmarks, latency, and direct GitHub / Zenodo links. |
| 🌱 **Scout** | Rapid prototyping, speculative hypotheses, "future work" density with low current mechanism surface. |

### Key metrics

- **Code-to-Concept Ratio** — share of recent papers with a linked GitHub repository.
- **Method/Intro Ratio** — methodology section length vs. introduction length, estimated from readable arXiv LaTeX source.
- **Workhorse Rating** — delta between a scholar's vision and delivered utility, adjusted for citation velocity.
- **Comparison Engine** — side-by-side synthesis of two researchers.

---

## Architecture

```
index.html          UI shell
styles.css          Warm serif "research report" aesthetic
ui.js               DOM rendering and event wiring
analyzer.js         Pure scoring logic (runs entirely in the browser)
fetcher.js          Thin fetch wrapper — calls the local API server
server.ps1          PowerShell backend (Windows)
server.js           Node.js backend (Mac / Linux / Windows)
```

The backend does three things the browser cannot:

1. **Queries the arXiv Atom API** for recent papers by author name or ORCID.
2. **Downloads and parses arXiv LaTeX source tarballs** to count intro/method words.
3. **Enriches citation data** via the Semantic Scholar API (optional, requires a free API key).

The frontend scoring in `analyzer.js` runs entirely in the browser against the JSON the server returns.

---

## Run locally

### Option A — Node.js (Mac / Linux / Windows, recommended)

Requires Node.js 18 or later.

```bash
git clone https://github.com/balladwoodley/Scholar-Pulse.git
cd Scholar-Pulse
node server.js
```

Navigate to **http://localhost:4173/**

### Option B — PowerShell (Windows only)

```powershell
git clone https://github.com/balladwoodley/Scholar-Pulse.git
cd Scholar-Pulse
.\server.ps1
```

Navigate to **http://localhost:4173/**

### Custom port

```bash
node server.js 8080        # Node
.\server.ps1 -Port 8080    # PowerShell
```

---

## Citation data (optional)

Without a Semantic Scholar API key, citation counts will be absent and the Workhorse rating will use a conservative fallback. To enable enrichment:

1. Register for a free key at [semanticscholar.org/product/api](https://www.semanticscholar.org/product/api)
2. Set the environment variable before launching the server:

```bash
# Mac / Linux
export SEMANTIC_SCHOLAR_API_KEY="your_key_here"
node server.js

# Windows (PowerShell)
$env:SEMANTIC_SCHOLAR_API_KEY = "your_key_here"
.\server.ps1
```

The server will log a reminder if the key is missing.

---

## Querying

- **Author name** — `Yoshua Bengio`, `Andrej Karpathy`, etc. The server filters arXiv results to entries where the queried name appears in the author list.
- **ORCID** — `0000-0002-7970-7855`. Uses the author's personal arXiv feed directly, which is more precise.

If an author name is common or ambiguous, prefer their ORCID for cleaner results.

---

## Scoring model

Scores are computed in `analyzer.js` entirely client-side. Keyword weights use density-adjusted scoring: repeated hits in a short abstract carry more signal than a single mention in a long one. Hard boosts apply for:

- Papers with a linked GitHub repo (`+4.5` engineer)
- Papers with a Zenodo DOI (`+` engineer)
- High citation counts (`>20` citations: `+1.4` engineer, `+0.8` oracle)
- Position papers and survey papers (`×1.35` oracle multiplier)
- Long, code-free abstracts (`+2.2` scout)

The Workhorse Rating formula: `(engineer_total / oracle_total) × citation_velocity`, classified into Builder / Applied Builder / Balanced Theorist / Posturer / Theorist.

---

## Tech stack

- **Frontend** — Vanilla JS (ES modules), HTML5, CSS3. No framework, no build step.
- **Backend** — PowerShell (`server.ps1`) or Node.js (`server.js`). No npm dependencies.
- **Data** — arXiv Atom API, arXiv e-print tarballs, Semantic Scholar Graph API.

---

## License

MIT — Copyright (c) 2026
