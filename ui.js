import { fetchScholarReport } from "./fetcher.js";
import { buildComparison, buildScholarReport, LAYER_COPY } from "./analyzer.js";

const form = document.getElementById("analyze-form");
const queryInput = document.getElementById("query-input");
const compareInput = document.getElementById("compare-input");
const analyzeButton = document.getElementById("analyze-button");
const statusLine = document.getElementById("status-line");
const profileCard = document.getElementById("profile-card");
const summaryOutput = document.getElementById("summary-output");
const scoreboard = document.getElementById("scoreboard");
const metricsOutput = document.getElementById("metrics-output");
const comparisonOutput = document.getElementById("comparison-output");
const paperGrid = document.getElementById("paper-grid");
const paperCardTemplate = document.getElementById("paper-card-template");
const loadingNote = document.getElementById("loading-note");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = queryInput.value.trim();
  const compareQuery = compareInput.value.trim();
  if (!query) {
    return;
  }
  await runAnalysis(query, compareQuery);
});

compareInput.addEventListener("input", () => {
  if (!analyzeButton.disabled) {
    analyzeButton.textContent = compareInput.value.trim() ? "Compare" : "Analyze";
  }
});

async function runAnalysis(query, compareQuery = "") {
  setLoadingState(
    true,
    compareQuery
      ? `Starting analysis for ${query} and ${compareQuery}...`
      : `Starting analysis for ${query}...`,
  );
  clearOutputs();

  try {
    setLoadingStage("Fetching recent arXiv papers. This can take a bit when source files are checked.");
    const primarySource = await fetchScholarReport(query);
    setLoadingStage(`Scoring ${primarySource.scholar.displayName}'s publication surface.`);
    const primary = buildScholarReport(primarySource);
    let secondary = null;
    if (compareQuery) {
      setLoadingStage(`Fetching comparison papers for ${compareQuery}.`);
      const secondarySource = await fetchScholarReport(compareQuery);
      setLoadingStage(`Scoring ${secondarySource.scholar.displayName}'s publication surface.`);
      secondary = buildScholarReport(secondarySource);
    } else {
      setLoadingStage("Finishing the single-author report.");
    }
    const comparison = buildComparison(primary, secondary);

    setLoadingStage("Rendering report cards and paper map.");
    renderProfile(primary);
    renderSummary(primary);
    renderScoreboard(primary);
    renderMetrics(primary);
    renderComparison(primary, secondary, comparison);
    renderPapers(primary.papers);

    statusLine.textContent = secondary
      ? `Read complete for ${primary.scholar.displayName} versus ${secondary.scholar.displayName}.`
      : `Read complete for ${primary.scholar.displayName}.`;
  } catch (error) {
    statusLine.textContent = "Analysis failed.";
    summaryOutput.className = "summary-output";
    summaryOutput.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
  } finally {
    setLoadingState(false);
  }
}

function setLoadingState(isLoading, message = "Ready.") {
  analyzeButton.disabled = isLoading;
  const hasCompare = compareInput.value.trim().length > 0;
  analyzeButton.textContent = isLoading
    ? (hasCompare ? "Comparing..." : "Analyzing...")
    : (hasCompare ? "Compare" : "Analyze");
  statusLine.textContent = message;
  loadingNote.classList.toggle("is-loading", isLoading);
  if (!isLoading) {
    loadingNote.innerHTML = `
      <div class="loading-note-copy">
        <strong>Single-author analysis is the default.</strong>
        <span>Add a second scholar only if you want a comparison pass.</span>
      </div>
    `;
  }
}

function setLoadingStage(message) {
  statusLine.textContent = message;
  loadingNote.innerHTML = `
    <div class="loading-note-copy">
      <strong>Working...</strong>
      <span>${escapeHtml(message)}</span>
    </div>
    <div class="loading-dots" aria-hidden="true">
      <span></span>
      <span></span>
      <span></span>
    </div>
  `;
}

function clearOutputs() {
  profileCard.className = "profile-card empty";
  profileCard.innerHTML = "<p>Building scholar sketch...</p>";
  summaryOutput.className = "summary-output empty";
  summaryOutput.innerHTML = "<p>Writing the single-author read...</p>";
  scoreboard.className = "scoreboard empty";
  scoreboard.innerHTML = "<p>Calculating signal mix...</p>";
  metricsOutput.className = "metrics-output empty";
  metricsOutput.innerHTML = "<p>Estimating code-to-concept ratio...</p>";
  comparisonOutput.className = "comparison-output empty";
  comparisonOutput.innerHTML = "<p>Comparison is optional and will populate only if you add a second scholar.</p>";
  paperGrid.className = "paper-grid empty";
  paperGrid.innerHTML = "<p>Reading papers and checking for code signals...</p>";
}

function renderProfile(report) {
  profileCard.className = "profile-card";
  const tags = [];
  if (report.scholar.mode === "orcid") tags.push("ORCID query");
  if (report.scholar.mode === "author") tags.push("Author query");
  tags.push(`${report.papers.length} recent papers`);
  if (report.warnings.length) tags.push(`${report.warnings.length} fetch note${report.warnings.length > 1 ? "s" : ""}`);

  profileCard.innerHTML = `
    <h3>${escapeHtml(report.scholar.displayName)}</h3>
    <p>${escapeHtml(report.profileType)}.</p>
    <div class="tag-row">
      ${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}
    </div>
    ${report.warnings.length ? `<p class="callout">${escapeHtml(report.warnings.join(" "))}</p>` : ""}
  `;
}

function renderSummary(report) {
  summaryOutput.className = "summary-output";
  const lines = [
    `${report.scholar.displayName} reads like ${report.profileType.toLowerCase()}. The strongest mechanism carrier is ${report.strongestMechanism?.title || "not yet clear"}, while the sharpest framing paper is ${report.strongestTheory?.title || "not yet clear"}.`,
    report.summary.codeToConcept,
    report.summary.workhorse,
    report.scoutiest ? `${report.scoutiest.title} is the scoutiest recent paper, which usually means exploratory reach is outrunning method right now.` : "",
  ].filter(Boolean);

  summaryOutput.innerHTML = lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
}

function renderScoreboard(report) {
  scoreboard.className = "scoreboard";
  scoreboard.innerHTML = ["oracle", "engineer", "scout"]
    .map((layer) => {
      return `
        <div class="score-pill ${layer}">
          <strong>${layer}</strong>
          <span>${Math.round(report.totals[layer])}</span>
          <small>${escapeHtml(LAYER_COPY[layer])}</small>
        </div>
      `;
    })
    .join("");
}

function renderMetrics(report) {
  const metrics = report.ratioMetrics;
  metricsOutput.className = "metrics-output";
  metricsOutput.innerHTML = `
    <div class="metric-grid">
      <article class="metric-card">
        <strong>GitHub Papers</strong>
        <div class="metric-value">${metrics.papersWithCode}/${metrics.publicationsCount}</div>
        <div class="metric-note">Recent papers with an explicit GitHub URL in abstract, comments, or linked metadata.</div>
      </article>
      <article class="metric-card">
        <strong>Code Ratio</strong>
        <div class="metric-value">${(metrics.codeRatio * 100).toFixed(0)}%</div>
        <div class="metric-note">A blunt first-pass measure of concept backed by visible implementation.</div>
      </article>
      <article class="metric-card">
        <strong>Method / Intro</strong>
        <div class="metric-value">${metrics.methodToIntroRatio == null ? "n/a" : `${metrics.methodToIntroRatio.toFixed(2)}x`}</div>
        <div class="metric-note">Estimated from readable arXiv source files, not from publisher PDFs.</div>
      </article>
      <article class="metric-card">
        <strong>Workhorse</strong>
        <div class="metric-value">${report.workhorse.score}</div>
        <div class="metric-note">${escapeHtml(report.workhorse.label)}. ${escapeHtml(report.workhorse.note)}</div>
      </article>
    </div>
  `;
}

function renderComparison(primary, secondary, comparison) {
  if (!secondary || !comparison) {
    comparisonOutput.className = "comparison-output empty";
    comparisonOutput.innerHTML = "<p>No comparison loaded. Add a second scholar if you want a side-by-side synthesis.</p>";
    return;
  }

  comparisonOutput.className = "comparison-output";
  comparisonOutput.innerHTML = `
    <div class="comparison-grid">
      ${renderComparisonCard(primary)}
      ${renderComparisonCard(secondary)}
    </div>
    <div class="comparison-call">
      <h3>Comparative read</h3>
      <p>${escapeHtml(comparison.narrative)}</p>
    </div>
  `;
}

function renderComparisonCard(report) {
  const metrics = [
    `${report.ratioMetrics.papersWithCode}/${report.ratioMetrics.publicationsCount} GitHub papers`,
    `${report.workhorse.score} workhorse`,
    `${Math.round(report.totals.engineer)} engineer`,
    `${Math.round(report.totals.oracle)} oracle`,
    `${Math.round(report.totals.scout)} scout`,
  ];

  return `
    <article class="comparison-card">
      <h3>${escapeHtml(report.scholar.displayName)}</h3>
      <p>${escapeHtml(report.profileType)}.</p>
      <div class="comparison-metrics">
        ${metrics.map((metric) => `<span class="stat">${escapeHtml(metric)}</span>`).join("")}
      </div>
    </article>
  `;
}

function renderPapers(papers) {
  paperGrid.className = "paper-grid";
  paperGrid.innerHTML = "";
  papers.forEach((paper) => {
    const node = paperCardTemplate.content.firstElementChild.cloneNode(true);
    const link = node.querySelector(".paper-link");
    const badge = node.querySelector(".paper-badge");
    const meta = node.querySelector(".paper-meta");
    const stats = node.querySelector(".paper-stats");
    const scores = node.querySelector(".paper-scores");
    const verdict = node.querySelector(".paper-verdict");

    link.href = paper.absUrl;
    link.textContent = paper.title;
    badge.textContent = paper.label;
    badge.classList.add(paper.dominantLayer);
    meta.textContent = [paper.published.slice(0, 10), paper.primaryCategory, paper.citationCount != null ? `${paper.citationCount} citations` : "citation data unavailable"]
      .filter(Boolean)
      .join(" • ");
    stats.innerHTML = [
      paper.hasCodeLink ? "GitHub linked" : "No GitHub link",
      paper.hasZenodoDoi ? "Zenodo DOI" : null,
      paper.sectionStats?.introductionWords ? `${paper.sectionStats.introductionWords} intro words` : null,
      paper.sectionStats?.methodologyWords ? `${paper.sectionStats.methodologyWords} method words` : null,
    ]
      .filter(Boolean)
      .map((item) => `<span class="stat">${escapeHtml(item)}</span>`)
      .join("");
    scores.innerHTML = Object.entries(paper.scores)
      .map(([key, value]) => `<span class="score-chip"><strong>${escapeHtml(key)}</strong>${Math.round(value)}</span>`)
      .join("");
    verdict.textContent = paper.verdict;

    paperGrid.appendChild(node);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

