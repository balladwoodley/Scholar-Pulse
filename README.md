# 🎓 Scholar Pulse — Research DNA Analyzer

An analytical tool that reads academic profiles like a theory of mind. Deconstruct ArXiv abstracts, citation velocity, and repository metadata to distinguish researchers by their energy.

![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E?logo=javascript&logoColor=white)
![HTML5](https://img.shields.io/badge/HTML5-CSS3-E34C26?logo=html5&logoColor=white)
![ArXiv API](https://img.shields.io/badge/ArXiv-API-B31B1B)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## What It Does

Traditional metrics focus on citation counts and h-index. **Scholar Pulse** looks at the *intent* behind the research.

It scans publication histories to determine if a scholar is defining a field, building mechanisms, or sketching futures — then assigns a **Workhorse Rating** that captures the delta between vision and delivered utility.

---

## The Signal Mix

Following the **Woodley Abstraction**, research output is categorized into three energy layers:

| Archetype | Focus | What They Do |
|-----------|-------|-------------|
| ✨ **The Oracle (Thesis)** | Strategic framing, foundational invariants | Provides the "why" and theoretical boundaries |
| ⚙️ **The Engineer (Mechanism)** | Utility and implementation | Verified by benchmarks, code, latency data |
| 🌱 **The Scout (Sketch)** | Rapid prototyping, speculative hypotheses | High "future work" density, low mechanism |

---

## Key Metrics

- **Code-to-Concept Ratio** — Scores researchers based on verifiable implementation (code) vs. conceptual abstraction
- **Workhorse Rating** — Top-line metric: delta between vision and delivered utility, adjusted for citation velocity
- **Comparison Engine** — Side-by-side synthesis of two researchers to identify strategic direction vs. heavy lifting

---

## Technical Stack

- **Frontend:** Vanilla JS / HTML5 / CSS3 (Serif "Research Report" aesthetic)
- **Data Layer:** Async fetch calls to ArXiv and Semantic Scholar Open Access APIs
- **Backend:** Minimalist PowerShell static server (`serve.ps1`) for local testing

---

## Installation & Usage

1. Clone the repository
2. Launch the local server using PowerShell:
   ```powershell
   .\serve.ps1
   ```
3. Navigate to `http://localhost:4173/` in your browser
4. Enter an ArXiv author name or ORCID ID to materialize the analysis

---

## How It Works

**Input:** ArXiv author name or ORCID  
**Processing:**
- Fetch publication history from ArXiv
- Extract abstracts and metadata
- Analyze code presence in repositories
- Calculate citation velocity
- Classify into Oracle/Engineer/Scout

**Output:** 
- Categorization of research energy
- Workhorse Rating (0-100)
- Comparison with other researchers
- Recommended collaboration direction

---

## Project Structure

```
scholar-pulse/
├── index.html      # App shell
├── styles.css      # Research report aesthetic
├── app.js          # Fetch logic, scoring, synthesis
├── serve.ps1       # Local development server
└── README.md
```

---

## What Makes It Different

❌ Not just a citation counter  
❌ Not just publication count  
  
✅ **Theory of mind for researchers** — Distinguishes thesis from mechanism from sketch  
✅ **Velocity-weighted** — Measures momentum, not just legacy  
✅ **Code-aware** — Values implementation, not just ideas  

---

## Contributing

Bug reports and pull requests welcome.

---

## License

MIT License - Copyright (c) 2026