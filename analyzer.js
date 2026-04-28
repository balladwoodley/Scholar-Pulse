const KEYWORDS = {
  oracle: {
    paradigm: 2.3,
    alignment: 2.4,
    foundational: 2.1,
    taxonomy: 2.1,
    framework: 1.7,
    ontology: 2.2,
    ethical: 1.9,
    "socio-technical": 2.2,
    robustness: 1.7,
    invariants: 2.0,
    theory: 1.6,
    survey: 1.4,
  },
  engineer: {
    benchmark: 2.1,
    sota: 2.2,
    latency: 2.0,
    pipeline: 1.7,
    dataset: 1.6,
    empirical: 1.6,
    implementation: 2.2,
    pytorch: 2.6,
    transformer: 1.5,
    accuracy: 1.8,
    reproducible: 1.6,
    evaluation: 1.4,
  },
  scout: {
    preliminary: 2.1,
    hypothesis: 1.9,
    "future work": 1.8,
    exploratory: 1.9,
    "pilot study": 2.1,
    potential: 1.4,
    roadmap: 1.8,
    concept: 1.4,
    vision: 1.3,
  },
};

const LAYER_COPY = {
  oracle: "Abstraction, framing, field-shaping language, and thesis energy.",
  engineer: "Mechanism, benchmarks, runnable artifacts, and buildability.",
  scout: "Exploratory posture, roadmap energy, and open-ended future motion.",
};

export { LAYER_COPY };

export function buildScholarReport(source) {
  const papers = source.publications.map(analyzePaper);
  const totals = papers.reduce(
    (acc, paper) => {
      acc.oracle += paper.scores.oracle;
      acc.engineer += paper.scores.engineer;
      acc.scout += paper.scores.scout;
      return acc;
    },
    { oracle: 0, engineer: 0, scout: 0 },
  );

  const publicationsCount = papers.length;
  const codePapers = papers.filter((paper) => paper.hasCodeLink).length;
  const introLengths = papers
    .map((paper) => paper.sectionStats?.introductionWords)
    .filter((value) => Number.isFinite(value) && value > 0);
  const methodLengths = papers
    .map((paper) => paper.sectionStats?.methodologyWords)
    .filter((value) => Number.isFinite(value) && value > 0);
  const citationVelocity = average(
    papers.map((paper) => paper.citationVelocity).filter((value) => Number.isFinite(value)),
    0.25,
  );
  const totalEngineer = totals.engineer;
  const totalOracle = Math.max(totals.oracle, 1);
  const workhorseRaw = (totalEngineer / totalOracle) * citationVelocity;
  const workhorseRating = classifyWorkhorse(workhorseRaw, totals, papers);
  const profileType = inferProfileType(totals, papers);
  const strongestMechanism = [...papers].sort((a, b) => b.engineerSignal - a.engineerSignal)[0] || null;
  const strongestTheory = [...papers].sort((a, b) => b.scores.oracle - a.scores.oracle)[0] || null;
  const scoutiest = [...papers].sort((a, b) => b.scores.scout - a.scores.scout)[0] || null;
  const ratioMetrics = {
    papersWithCode: codePapers,
    publicationsCount,
    codeRatio: publicationsCount ? codePapers / publicationsCount : 0,
    averageIntroductionWords: introLengths.length ? Math.round(average(introLengths)) : null,
    averageMethodologyWords: methodLengths.length ? Math.round(average(methodLengths)) : null,
    methodToIntroRatio:
      introLengths.length && methodLengths.length && average(introLengths) > 0
        ? average(methodLengths) / average(introLengths)
        : null,
    sectionCoverage: Math.min(introLengths.length, methodLengths.length),
  };

  return {
    source,
    scholar: source.scholar,
    warnings: source.warnings || [],
    papers,
    totals,
    ratioMetrics,
    citationVelocity,
    workhorse: {
      raw: workhorseRaw,
      ...workhorseRating,
    },
    profileType,
    strongestMechanism,
    strongestTheory,
    scoutiest,
    summary: summarizeScholar({
      scholar: source.scholar,
      papers,
      totals,
      ratioMetrics,
      profileType,
      strongestMechanism,
      strongestTheory,
      scoutiest,
      workhorse: workhorseRating,
    }),
  };
}

export function buildComparison(primary, secondary) {
  if (!secondary) {
    return null;
  }

  const moreOracle = primary.totals.oracle >= secondary.totals.oracle ? primary : secondary;
  const moreEngineer = primary.totals.engineer >= secondary.totals.engineer ? primary : secondary;
  const moreScout = primary.totals.scout >= secondary.totals.scout ? primary : secondary;

  return {
    narrative: `${moreOracle.scholar.displayName} defines more of the field's framing language, ${moreEngineer.scholar.displayName} carries more mechanism signal, and ${moreScout.scholar.displayName} leaves more room for exploratory runway.`,
  };
}

function analyzePaper(paper) {
  const text = [paper.title, paper.summary, paper.comment, paper.journalRef].filter(Boolean).join(" ").toLowerCase();
  const scores = {
    oracle: scoreKeywords(text, KEYWORDS.oracle),
    engineer: scoreKeywords(text, KEYWORDS.engineer),
    scout: scoreKeywords(text, KEYWORDS.scout),
  };

  if (/\b(position paper|literature review|systematic review|survey)\b/i.test(`${paper.title} ${paper.comment || ""}`)) {
    scores.oracle *= 1.35;
  }

  if (paper.hasCodeLink || paper.hasZenodoDoi) {
    scores.engineer += 4.5;
  }

  if ((paper.summary || "").length > 1500 && !paper.hasCodeLink && scores.engineer < 4) {
    scores.scout += 2.2;
  }

  if ((paper.citationCount || 0) <= 2 && scores.engineer < 4) {
    scores.scout += 1.1;
  }

  if ((paper.citationCount || 0) > 20) {
    scores.engineer += 1.4;
    scores.oracle += 0.8;
  }

  const dominantLayer = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
  const citationVelocity = computeCitationVelocity(paper);
  const engineerSignal = scores.engineer * 1.35 + (paper.hasCodeLink ? 5 : 0) + citationVelocity;

  return {
    ...paper,
    scores,
    dominantLayer,
    citationVelocity,
    engineerSignal,
    label: buildPaperLabel(scores, paper),
    verdict: buildPaperVerdict(scores, paper),
  };
}

function summarizeScholar(report) {
  return {
    primary: `${report.scholar.displayName} reads like ${report.profileType.toLowerCase()}. Recent work leans on ${describeBalance(report.totals)}.`,
    codeToConcept:
      report.ratioMetrics.publicationsCount === 0
        ? "No recent publications were available for analysis."
        : `${report.ratioMetrics.papersWithCode}/${report.ratioMetrics.publicationsCount} recent papers mention a GitHub repository. ${
            report.ratioMetrics.methodToIntroRatio == null
              ? "Section-length coverage is still sparse, so the intro-versus-method read is provisional."
              : `Average methodology-to-introduction ratio is ${report.ratioMetrics.methodToIntroRatio.toFixed(2)}x across ${report.ratioMetrics.sectionCoverage} source-readable papers.`
          }`,
    workhorse: `Workhorse read: ${report.workhorse.label}. ${report.workhorse.note}`,
  };
}

function describeBalance(totals) {
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  return `${sorted[0][0]} energy first, with ${sorted[1][0]} as the secondary layer`;
}

function inferProfileType(totals, papers) {
  const codeAnchors = papers.filter((paper) => paper.hasCodeLink || paper.scores.engineer >= 7).length;
  if (totals.oracle >= totals.engineer * 1.15 && codeAnchors <= 1) {
    return "Theorist-architect with stronger framing than mechanism";
  }
  if (totals.engineer >= totals.oracle * 0.95 && codeAnchors >= 2) {
    return "Builder-researcher with visible executable anchors";
  }
  if (totals.scout > totals.engineer && codeAnchors === 0) {
    return "Exploratory scout whose public surface runs ahead of mechanism";
  }
  return "Hybrid scholar with both thesis and mechanism in motion";
}

function classifyWorkhorse(raw, totals, papers) {
  const label =
    raw >= 8
      ? "Builder"
      : raw >= 4
        ? "Applied Builder"
        : raw > 0.75
          ? "Balanced Theorist"
          : totals.scout > totals.engineer
            ? "Posturer"
            : "Theorist";

  const note =
    label === "Builder"
      ? "Engineer signal is keeping up with theory, and the citation surface is moving."
      : label === "Applied Builder"
        ? "There is real mechanism here, but it has not fully outrun the conceptual layer."
        : label === "Posterur"
          ? "Exploratory energy is outrunning concrete mechanism right now."
          : "Theory is carrying more weight than build artifacts in the visible paper surface.";

  const score = clamp(Math.round(raw * 10) / 10, -99, 999);
  const anchor = [...papers].sort((a, b) => b.engineerSignal - a.engineerSignal)[0] || null;
  return { label, note, score, anchor };
}

function buildPaperLabel(scores, paper) {
  if (paper.hasCodeLink && scores.engineer >= scores.oracle) {
    return "Architecture Anchor";
  }
  if (scores.oracle > scores.engineer && scores.oracle >= scores.scout) {
    return "Field Framing";
  }
  if (scores.scout >= scores.engineer && !paper.hasCodeLink) {
    return "Experimental Sketch";
  }
  return "Mechanism Carrier";
}

function buildPaperVerdict(scores, paper) {
  if (paper.hasCodeLink && scores.engineer >= 6.5) {
    return "Code-bearing paper with strong mechanism markers. This is the cleanest build signal in the set.";
  }
  if (scores.oracle >= scores.engineer * 1.2) {
    return "This paper is doing more strategic framing than implementation anchoring.";
  }
  if (scores.scout > scores.engineer && !paper.hasCodeLink) {
    return "Promising exploratory posture, but the mechanism layer is still light.";
  }
  return "Mixed paper: enough mechanism to matter, but still carrying thesis energy.";
}

function scoreKeywords(text, weights) {
  const wordCount = Math.max(text.split(/\s+/).length, 1);
  return Object.entries(weights).reduce((sum, [keyword, weight]) => {
    // Count occurrences rather than just presence, then scale by density
    const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const hits = (text.match(regex) || []).length;
    if (!hits) return sum;
    // Density bonus: more hits relative to doc length = stronger signal
    const density = hits / wordCount;
    const densityMultiplier = 1 + Math.min(density * 300, 1.5); // caps at 2.5x
    return sum + weight * hits * densityMultiplier;
  }, 0);
}

function computeCitationVelocity(paper) {
  const citationCount = Number(paper.citationCount || 0);
  if (!citationCount) {
    return 0.25;
  }

  const published = new Date(paper.published);
  const ageInYears = Math.max((Date.now() - published.getTime()) / (365.25 * 24 * 60 * 60 * 1000), 0.25);
  return citationCount / ageInYears;
}

function average(values, fallback = 0) {
  if (!values.length) {
    return fallback;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
