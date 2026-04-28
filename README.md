# Scholar Pulse (SP)

Scholar Pulse is an analytical tool designed to read academic profiles like a theory of mind. By deconstructing ArXiv abstracts, citation velocity, and repository metadata, it distinguishes a researcher’s high-level strategic framing from their actual experimental mechanism.

## Overview

Traditional metrics focus on citation counts and h-index. Scholar Pulse looks at the **intent** behind the research. It scans publication histories to determine if a scholar is defining a field, building its infrastructure, or prototyping its future.

## The Signal Mix

Following the taxonomic principles of the Woodley Abstraction, research output is categorized into three energy layers:

* ✨ **The Oracle (Thesis):** Focuses on strategic framing, alignment, and foundational invariants. These researchers provide the "why" and the theoretical boundaries of the domain.
* ⚙️ **The Engineer (Mechanism):** Focuses on utility and implementation. Verified by benchmarks, latency data, and direct links to GitHub or Zenodo repositories.
* 🌱 **The Scout (Sketch):** Focuses on rapid prototyping and speculative hypotheses. High density of "future work" with low current mechanism surface.

## Key Metrics

- **Code-to-Concept Ratio:** A specialized weighting system that scores researchers based on the presence of verifiable implementation (code) versus conceptual abstraction.
- **Workhorse Rating:** A top-line metric calculating the delta between a scholar’s vision and their delivered utility, adjusted for citation velocity.
- **Comparison Engine:** Side-by-side synthesis of two researchers to identify who is setting the strategic direction and who is providing the heavy lifting.

## Technical Stack

* **Frontend:** Vanilla JS / HTML5 / CSS3 (Serif-heavy "Research Report" aesthetic).
* **Data Layer:** Asynchronous fetch calls to ArXiv and Semantic Scholar Open Access APIs.
* **Backend:** Minimalist PowerShell static server (`serve.ps1`) for local testing.

## Run Locally

1. Clone the repository.
2. Launch the local server using PowerShell:
   ```powershell
   .\serve.ps1
3. Navigate to `http://localhost:4173/` in your browser.
4. Enter an ArXiv author name or ORCID ID to materialise the analysis.

## License

MIT License - Copyright (c) 2026
```
