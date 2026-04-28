#!/usr/bin/env node
/**
 * Scholar Pulse — cross-platform dev server (Node.js alternative to server.ps1)
 * Usage: node server.js [port]
 * Requires: Node.js 18+ (uses built-in fetch)
 *
 * Optional: set SEMANTIC_SCHOLAR_API_KEY in your environment for citation data.
 *   Windows:  $env:SEMANTIC_SCHOLAR_API_KEY="your_key"
 *   Mac/Linux: export SEMANTIC_SCHOLAR_API_KEY="your_key"
 */

import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import os from "os";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.argv[2] || process.env.PORT || "4173", 10);
const SEMANTIC_KEY = process.env.SEMANTIC_SCHOLAR_API_KEY || "";

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

// ── Rate-limit guard for Semantic Scholar ────────────────────────────────────
let lastSemanticCall = 0;
async function rateLimitedFetch(url, headers = {}) {
  const now = Date.now();
  const wait = 1200 - (now - lastSemanticCall);
  if (wait > 0) await sleep(wait);
  lastSemanticCall = Date.now();
  const res = await fetch(url, { headers });
  return res.json();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── ArXiv fetching ────────────────────────────────────────────────────────────
function normalizeWhitespace(s) {
  return s ? s.replace(/\s+/g, " ").trim() : "";
}

async function fetchArxivEntries(query, limit) {
  const warnings = [];
  const isOrcid = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(query);
  const mode = isOrcid ? "orcid" : "author";
  let displayName = query;
  let xmlText;

  if (isOrcid) {
    const res = await fetch(`https://arxiv.org/a/${query}.atom`);
    xmlText = await res.text();
  } else {
    const encoded = encodeURIComponent(`"${query}"`);
    const maxResults = Math.max(limit * 3, 20);
    const url = `http://export.arxiv.org/api/query?search_query=au:${encoded}&start=0&max_results=${maxResults}&sortBy=submittedDate&sortOrder=descending`;
    const res = await fetch(url);
    xmlText = await res.text();
  }

  // Parse XML via regex (no DOM dependency in Node)
  const getTag = (xml, tag) => {
    const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
    return m ? normalizeWhitespace(m[1].replace(/<[^>]+>/g, "")) : "";
  };

  const getAttr = (xml, tag, attr) => {
    const m = xml.match(new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, "i"));
    return m ? m[1] : "";
  };

  const getAllMatches = (xml, tag) => {
    const results = [];
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
    let m;
    while ((m = re.exec(xml)) !== null) results.push(m[1]);
    return results;
  };

  // Extract entries
  const entryBlocks = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/gi;
  let em;
  while ((em = entryRe.exec(xmlText)) !== null) entryBlocks.push(em[1]);

  if (isOrcid) {
    const titleM = xmlText.match(/<feed[^>]*>[\s\S]*?<title>([^<]*)<\/title>/i);
    if (titleM) displayName = titleM[1].replace(/'s articles on arXiv$/, "").trim();
  }

  let filtered = entryBlocks;
  if (!isOrcid) {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    const withAuthor = entryBlocks.filter((entry) => {
      const authorBlocks = getAllMatches(entry, "author");
      return authorBlocks.some((a) => {
        const name = getTag(a, "name").toLowerCase();
        return tokens.every((t) => name.includes(t));
      });
    });
    if (!withAuthor.length) {
      warnings.push(
        "No exact author-name filter hit cleanly, so the raw arXiv author query may need a more specific name or ORCID."
      );
    } else {
      filtered = withAuthor;
    }
  }

  const publications = filtered.slice(0, limit).map((entry) => {
    const idRaw = getTag(entry, "id");
    const versionedId = idRaw.split("/").pop();
    const baseId = versionedId.replace(/v\d+$/, "");
    const title = getTag(entry, "title");
    const summary = getTag(entry, "summary");
    const comment = getTag(entry, "arxiv:comment") || "";
    const doi = getTag(entry, "arxiv:doi") || "";
    const journalRef = getTag(entry, "arxiv:journal_ref") || "";
    const primaryCategory = (() => {
      const m = entry.match(/<arxiv:primary_category[^>]*term="([^"]*)"/i);
      return m ? m[1] : "";
    })();
    const published = getTag(entry, "published");
    const updated = getTag(entry, "updated");

    const linkAlts = [...entry.matchAll(/<link[^>]*rel="alternate"[^>]*href="([^"]*)"/gi)];
    const linkPdfs = [...entry.matchAll(/<link[^>]*title="pdf"[^>]*href="([^"]*)"/gi)];
    const absUrl = (linkAlts[0]?.[1] || `https://arxiv.org/abs/${versionedId}`).replace(/^http:/, "https:");
    const pdfUrl = (linkPdfs[0]?.[1] || `https://arxiv.org/pdf/${versionedId}`).replace(/^http:/, "https:");

    const authorBlocks = getAllMatches(entry, "author");
    const authors = authorBlocks.map((a) => getTag(a, "name"));

    const allText = [title, summary, comment].join(" ");
    const githubUrls = [...new Set(
      [...allText.matchAll(/https?:\/\/[^\s\]>)"]+/g)]
        .map((m) => m[0].replace(/\.$/, ""))
        .filter((u) => u.includes("github.com"))
    )];

    return {
      arxivId: baseId,
      versionedArxivId: versionedId,
      title,
      summary,
      comment,
      doi,
      journalRef,
      primaryCategory,
      published,
      updated,
      authors,
      absUrl,
      pdfUrl,
      githubUrls,
      hasCodeLink: githubUrls.length > 0,
      hasZenodoDoi: doi.startsWith("10.5281/zenodo."),
      sectionStats: null,
      citationCount: null,
      influentialCitationCount: null,
      openAccessPdf: null,
      semanticScholarUrl: null,
    };
  });

  return { scholar: { query, displayName, mode }, warnings, publications };
}

// ── LaTeX section word-counting ───────────────────────────────────────────────
function measureTexSections(tex) {
  if (!tex) return null;
  const clean = tex.replace(/(?<!\\)%.*$/gm, "");
  const sectionRe = /\\section\*?\{([^}]+)\}/gi;
  const matches = [...clean.matchAll(sectionRe)];
  if (matches.length < 2) return null;

  const sections = matches.map((m, i) => {
    const start = m.index + m[0].length;
    const end = i < matches.length - 1 ? matches[i + 1].index : clean.length;
    const body = clean.slice(start, end);
    const plain = body
      .replace(/\\[a-zA-Z@]+(\[[^\]]*\])?(\{[^{}]*\})?/g, " ")
      .replace(/\$[^$]*\$/g, " ")
      .replace(/[{}\\_~^]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const words = plain ? plain.split(" ").filter(Boolean).length : 0;
    return { name: normalizeWhitespace(m[1]).toLowerCase(), words };
  });

  const intro = sections.find((s) => /^(introduction|background|overview)$/.test(s.name));
  const method = sections.find((s) => /(method|methodology|approach|implementation|experimental setup)/.test(s.name));
  if (!intro && !method) return null;
  return {
    introductionWords: intro?.words ?? null,
    methodologyWords: method?.words ?? null,
  };
}

async function getSectionStats(arxivId) {
  const tmpPath = path.join(os.tmpdir(), `scholar-pulse-${crypto.randomUUID()}.tar`);
  try {
    const res = await fetch(`https://arxiv.org/e-print/${arxivId}`);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(tmpPath, buf);
    let files;
    try {
      files = execSync(`tar -tf "${tmpPath}" 2>/dev/null`, { encoding: "utf8" })
        .split("\n")
        .filter((f) => f.endsWith(".tex"));
    } catch {
      return null;
    }
    if (!files.length) return null;
    const candidates = [];
    for (const file of files) {
      try {
        const content = execSync(`tar -xOf "${tmpPath}" "${file}" 2>/dev/null`, { encoding: "utf8" });
        if (content.includes("\\begin{document}")) {
          candidates.push({ file, text: content, length: content.length });
        }
      } catch { /* skip */ }
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => b.length - a.length);
    return measureTexSections(candidates[0].text);
  } catch {
    return null;
  } finally {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  }
}

// ── Semantic Scholar enrichment ───────────────────────────────────────────────
async function enrichWithSemanticScholar(publications, warnings) {
  if (!SEMANTIC_KEY) {
    warnings.push(
      "Semantic Scholar enrichment is disabled because SEMANTIC_SCHOLAR_API_KEY is not set, so citation velocity is conservative."
    );
    return;
  }
  for (const paper of publications) {
    try {
      const encoded = encodeURIComponent(paper.title);
      const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encoded}&limit=1&fields=title,citationCount,influentialCitationCount,openAccessPdf,url`;
      const data = await rateLimitedFetch(url, { "x-api-key": SEMANTIC_KEY });
      const match = data.data?.[0];
      if (match) {
        paper.citationCount = match.citationCount;
        paper.influentialCitationCount = match.influentialCitationCount;
        paper.semanticScholarUrl = match.url;
        if (match.openAccessPdf) paper.openAccessPdf = match.openAccessPdf.url;
      }
    } catch {
      warnings.push("Semantic Scholar enrichment hit a rate or availability limit during this run.");
      break;
    }
  }
}

// ── Build full payload ────────────────────────────────────────────────────────
async function buildPublicationPayload(query, limit) {
  const arxiv = await fetchArxivEntries(query, limit);
  await Promise.all(
    arxiv.publications.map(async (paper) => {
      paper.sectionStats = await getSectionStats(paper.arxivId);
    })
  );
  await enrichWithSemanticScholar(arxiv.publications, arxiv.warnings);
  return arxiv;
}

// ── HTTP server ───────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  if (req.method !== "GET") {
    res.writeHead(405, { "Content-Type": "text/plain" });
    return res.end("Method not allowed");
  }

  const [pathname, queryString] = (req.url || "/").split("?");

  if (pathname.startsWith("/api/publications")) {
    const params = Object.fromEntries(new URLSearchParams(queryString || ""));
    const query = (params.query || "").trim();
    const limit = Math.min(parseInt(params.limit || "10", 10) || 10, 20);
    if (!query) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Missing required query parameter." }));
    }
    try {
      const payload = await buildPublicationPayload(query, limit);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      return res.end(JSON.stringify(payload));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  // Static file serving
  const relative = pathname.replace(/^\//, "") || "index.html";
  const fullPath = path.resolve(__dirname, relative);
  if (!fullPath.startsWith(__dirname)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    return res.end("Not found");
  }

  const ext = path.extname(fullPath).toLowerCase();
  const contentType = CONTENT_TYPES[ext] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": contentType });
  fs.createReadStream(fullPath).pipe(res);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Scholar Pulse running at http://localhost:${PORT}/`);
  if (!SEMANTIC_KEY) {
    console.log(
      "  Tip: set SEMANTIC_SCHOLAR_API_KEY in your environment for citation data."
    );
  }
});
