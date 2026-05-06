import Anthropic from "@anthropic-ai/sdk";

function normalizeStr(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(normalizeStr).join('\n\n');
  if (typeof v === 'object') return Object.values(v).filter(Boolean).map(normalizeStr).join('\n\n');
  return String(v);
}

function normalizeArr(v, itemFn) {
  if (!v) return [];
  const fn = itemFn || normalizeStr;
  if (!Array.isArray(v)) return [fn(v)];
  return v.map(fn);
}

function normalizePaper(p) {
  if (!p || typeof p !== 'object') return {};
  return {
    title: normalizeStr(p.title),
    contribution_statement: normalizeStr(p.contribution_statement),
    abstract: normalizeStr(p.abstract),
    research_questions: normalizeArr(p.research_questions),
    hypotheses: normalizeArr(p.hypotheses),
    intro_paragraphs: normalizeArr(p.intro_paragraphs),
    theoretical_framework: p.theoretical_framework && typeof p.theoretical_framework === 'object' ? {
      heading: normalizeStr(p.theoretical_framework.heading),
      primary_theory_para: normalizeStr(p.theoretical_framework.primary_theory_para),
      secondary_theory_para: normalizeStr(p.theoretical_framework.secondary_theory_para),
      integration_para: normalizeStr(p.theoretical_framework.integration_para),
      propositions: normalizeArr(p.theoretical_framework.propositions)
    } : null,
    lit_review_sections: normalizeArr(p.lit_review_sections, s => {
      if (!s || typeof s !== 'object') return { heading: '', para1: normalizeStr(s), para2: '', synthesis: '', content: '' };
      return {
        heading: normalizeStr(s.heading),
        para1: normalizeStr(s.para1),
        para2: normalizeStr(s.para2),
        synthesis: normalizeStr(s.synthesis),
        content: normalizeStr(s.content)
      };
    }),
    methodology_paragraphs: normalizeArr(p.methodology_paragraphs),
    results_placeholders: normalizeArr(p.results_placeholders),
    results_guidance: normalizeStr(p.results_guidance),
    discussion_paragraphs: normalizeArr(p.discussion_paragraphs),
    conclusion_paragraphs: normalizeArr(p.conclusion_paragraphs),
    future_directions: normalizeArr(p.future_directions),
    references: normalizeArr(p.references)
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { topic, gap, branch, allNodes, authors, targetJournal, keywords, researcherContext } = req.body;

  const studiedNodes = (allNodes || []).filter(n => n.type === "studied");
  const debateNodes  = (allNodes || []).filter(n => n.type === "debate");

  const litContext = studiedNodes.map(n =>
    `- "${n.name}" [${n.branchName}]: ${n.finding || ""}. KEY PAPERS: ${(n.papers||[]).map(p=>`${p.authors} (${p.year}), "${p.title}"`).join(" | ")}`
  ).join("\n");

  const debContext = debateNodes.map(n =>
    `- CONTESTED: "${n.name}": ${n.finding||""}. SIDES: ${(n.papers||[]).map(p=>`${p.authors} (${p.year})`).join(" VS ")}`
  ).join("\n");

  const authCtx = (authors||[]).map(a=>`${a.name} (${a.affiliation}) — ${a.focus}. Known for: ${a.known_for}`).join("\n");

  const prompt = `You are a SENIOR ACADEMIC EDITOR and PhD supervisor at a world-ranked research university. You are producing a structured manuscript framework for a doctoral researcher. This will go to a high-impact peer-reviewed journal. These quality standards are ABSOLUTE and non-negotiable.

═══ MANDATORY QUALITY STANDARDS ═══
1. CITATION DENSITY: Every paragraph in the introduction and literature review MUST cite a minimum of 4 specific studies by name. NEVER write "research shows" or "studies suggest" without naming the study. Format: (Author & Author, Year) or (Author et al., Year).
2. CRITICAL SYNTHESIS: Do NOT merely describe what studies found. COMPARE them: "While X found... Y's larger sample demonstrated the opposite... reconciling these positions, Z's meta-analysis (N=47 studies) concluded..."
3. THEORETICAL GROUNDING: Every hypothesis must name the specific theory and mechanism behind it. Every paragraph must be anchored to theoretical constructs, not just empirical observations.
4. SPECIFICITY IN PLACEHOLDERS: [RESEARCHER: ...] markers must be hyper-specific supervisor annotations — they must tell the researcher EXACTLY what statistic, format, argument, and theoretical connection is required. Generic placeholders like "insert your results here" are FORBIDDEN.
5. ACADEMIC PRECISION: Use technical vocabulary appropriate to ${branch.name}. State effect sizes, confidence intervals, and sample sizes when citing empirical studies.
6. CONTRIBUTION ARTICULATION: The theoretical, empirical, and methodological contributions must each be stated with surgical precision — which theory is extended, which empirical gap is filled, which population is newly studied.

═══ STUDY PARAMETERS ═══
TOPIC: ${topic}
GAP: "${gap.name}"
RATIONALE FOR GAP: ${gap.rationale || "understudied area with no empirical foundation"}
RESEARCH METHOD: ${gap.method}
THEORETICAL DOMAIN: ${branch.name}
TARGET JOURNAL: ${targetJournal || "top-tier academic journal in this field"}
KEYWORDS: ${(keywords||[]).join(", ")}
${researcherContext ? `RESEARCHER'S OWN CONTEXT (incorporate this throughout): ${researcherContext}\n` : ""}

═══ ESTABLISHED LITERATURE (you MUST cite these papers throughout the draft) ═══
${litContext}

═══ CONTESTED AREAS (you MUST acknowledge and engage these debates) ═══
${debContext}

═══ KEY SCHOLARS IN THIS FIELD ═══
${authCtx}

═══ OUTPUT FORMAT ═══
Return ONLY raw JSON — no markdown, no code fences. Start with { end with }.

{
  "title": "Precise, arguable academic title. Avoid 'exploring' or 'investigating'. State the relationship, context, or phenomenon directly. Max 18 words.",

  "contribution_statement": "One precise sentence: This study extends [specific theory] by [specific mechanism], fills the empirical gap in [specific domain] by examining [specific population/context] using [specific method], and provides [specific practical output] for [specific beneficiary].",

  "abstract": "Structured abstract ~300 words. Section 1 — Background (3 sentences): Name the macro problem with a statistic or documented scale, identify the theoretical anchor, state what prior research has established. Section 2 — Gap (2 sentences): What specifically is unknown and why existing studies cannot resolve it. Section 3 — Method (2 sentences): Design, sample characteristics, analytical approach. Section 4 — [RESEARCHER — REQUIRED: Replace this with your actual key findings. Provide: 2-3 specific results with direction and magnitude. Format: 'Results demonstrated that [finding 1], with [finding 2] moderating this relationship (β=X.XX, p<.001)']. Section 5 — Contribution (2 sentences): Theoretical advance and practical application.",

  "research_questions": [
    "RQ1: What is the [direction/magnitude/nature] of the relationship between [independent variable] and [dependent variable] among [population] in [context]?",
    "RQ2: To what extent does [moderator/mediator] influence the relationship between [X] and [Y]?",
    "RQ3: How do [contextual/boundary conditions] shape [the focal relationship]?"
  ],

  "hypotheses": [
    "H1 (grounded in [specific theory]): [Precise directional hypothesis stating mechanism]. [Theory name] predicts that [mechanism], therefore [specific population] who experience [X] will exhibit significantly higher/lower [Y] compared to those who do not.",
    "H2: [Moderation/mediation hypothesis with theoretical rationale]. Drawing on [theory], the positive relationship between [X] and [Y] will be stronger/weaker when [moderator] is high versus low.",
    "H3: [Boundary condition or contextual hypothesis with theoretical justification]."
  ],

  "intro_paragraphs": [
    "~160 words: Open with a specific, documented real-world problem — cite a statistic, a policy failure, or an organisational phenomenon that is empirically established. Name 2-3 foundational scholars in this domain. Establish the theoretical tension that makes this topic unresolved.",
    "~180 words: Trace the intellectual trajectory of this field over the past two decades. What did foundational theoretical work establish? (cite the original theories) What did the first wave of empirical studies demonstrate? (cite 4-5 studies with their specific findings and effect sizes where known) What have more recent studies challenged or refined? End by noting what the accumulated evidence can and cannot explain.",
    "~140 words: Diagnose the gap surgically. Do not say 'X has not been studied'. Instead: identify what the nearest studies examined, what methodological or conceptual limitation prevented them from addressing the gap, and what the theoretical consequence of this absence is. Cite the 2-3 closest studies and explain their shortcomings explicitly.",
    "~120 words: State this study's contribution with precision: the theoretical framework applied and why it is uniquely suited to this gap, the method chosen and why it overcomes the limitations of prior approaches, the specific population/context studied and why it represents a critical case.",
    "[RESEARCHER — COMPULSORY (~80 words): You must write this paragraph. State: (1) your exact sample size and composition, (2) geographic/industry/institutional context, (3) data collection method and period, (4) outline of paper sections. Format: 'Drawing on [method] data from N=[X] [sample description] collected during [period] in [context], this study proceeds as follows: Section 2 develops the theoretical framework... Section 3 reviews the literature... Section 4 presents the methodology... Section 5 reports findings... Section 6 discusses implications... Section 7 concludes.']"
  ],

  "theoretical_framework": {
    "heading": "specific heading for this section (e.g., 'Agency Theory and Algorithmic Control')",
    "primary_theory_para": "~200 words: Introduce the primary theoretical lens with full intellectual rigour. Name the original theorist(s) and seminal work (Author, Year). Explain the theory's core constructs, the causal mechanism it proposes, and its domain assumptions. Then cite 3-4 empirical studies that have applied this theory in related contexts — state what those applications found and where they stopped short of addressing the current gap. End with the specific proposition this theory generates for the current study.",
    "secondary_theory_para": "~160 words: Introduce the complementary theoretical perspective. Explain the additional explanatory mechanism it provides that the primary theory alone cannot account for. Cite the original development and 2-3 empirical applications. Articulate the interaction between the two theories.",
    "integration_para": "~120 words: Synthesise the two theoretical perspectives into a unified framework for this study. What joint prediction do they generate? How do they specify the mechanisms linking [X] to [Y] via [Z]? State the theoretical model explicitly.",
    "propositions": [
      "Proposition 1 (from [theory 1]): Specific theoretical proposition grounded in the mechanism above.",
      "Proposition 2 (from [theory 2]): Specific theoretical proposition.",
      "Proposition 3 (integrative): Proposition arising from the interaction of both theories."
    ]
  },

  "lit_review_sections": [
    {
      "heading": "specific conceptual heading grounded in established construct names in this field",
      "para1": "~200 words: Establish what is known. Cite 5 specific studies. Compare their findings using precise language: 'Building on [Author, Year]'s foundational argument that X, subsequent work by [Author et al., Year] demonstrated Y across N=[X] samples. However, [Author & Author, Year]'s longitudinal study found Z, challenging the earlier consensus. A meta-analysis of [N] studies (Author et al., Year) ultimately concluded [effect size/direction], though noting significant heterogeneity across [context variable].' Establish the empirical consensus AND its limits.",
      "para2": "~170 words: Methodological and conceptual critique. What are the shared limitations of these studies? (e.g., cross-sectional designs preventing causal inference, WEIRD samples limiting generalisability, single-source data inflating correlations, conceptual conflation of distinct constructs). Cite 2-3 studies that have explicitly noted these gaps or called for further research. Introduce the unresolved theoretical tension that makes this sub-theme directly relevant to the gap.",
      "synthesis": "~70 words: Synthetic statement — what does the accumulated evidence in this sub-theme establish for the paper's argument, and what precise question does it leave unanswered? This sentence should flow directly into the next section or into the hypothesis development."
    }
  ],

  "methodology_paragraphs": [
    "~110 words: Research philosophy — state the ontological position (e.g., critical realism, post-positivism, social constructivism) and epistemological stance. Justify this positioning with respect to the nature of the research questions and the phenomenon being studied. Cite a methodological authority (e.g., Creswell & Creswell, 2018; Bryman, 2016; Saunders et al., 2019).",
    "~130 words: Research design — specify the exact design type for ${gap.method}. Justify this choice over two plausible alternatives by referencing their limitations for this research context. Cite methodological literature that supports this design choice (e.g., Yin, 2018 for case study; Braun & Clarke, 2006 for thematic analysis; Hair et al., 2019 for SEM; Field, 2024 for regression).",
    "[RESEARCHER — COMPULSORY: Sample and data collection. Provide ALL of the following (approximately 150 words): (1) Total sample size. For quantitative: state the a priori power analysis (G*Power or similar) — target power=.80, α=.05, estimated effect size f²/d/r — and the resulting minimum N. For qualitative: justify saturation/purposive criteria. (2) Sampling strategy and why it is appropriate. (3) Inclusion/exclusion criteria. (4) Data collection instrument — name it specifically. (5) Collection procedure — mode, timing, language, number of waves. (6) Response rate and any non-response bias checks. Format: 'Participants were recruited from [population] using [strategy]. Of [total approached], N=[X] completed the survey (response rate=X%), yielding a final sample of N=[X] (X% female; M age=X.XX, SD=X.XX)...']",
    "~140 words: Instrumentation and measures. For EVERY key construct: name the specific validated scale, cite the development paper, state the number of items, response format (e.g., 7-point Likert anchored 1=strongly disagree to 7=strongly agree), and Cronbach's α from the original validation study. Example: '[Construct] was measured using the [Scale Name] (Author & Author, Year; α=.XX in the original validation), comprising X items (e.g., 'Sample item text'). Scores were averaged, with higher scores indicating greater [construct].' For qualitative: describe interview protocol development, pilot testing, and prompts.",
    "~110 words: Analytical procedure. Name the specific statistical tests in sequence (e.g., preliminary: normality, multicollinearity, common method variance via Harman's single factor; main analysis: hierarchical regression / Hayes PROCESS macro / SEM in AMOS/R; supplementary: bootstrapped indirect effects, 95% CI). For qualitative: name the exact framework (e.g., reflexive thematic analysis per Braun & Clarke, 2006, 6-phase model) and how rigour was ensured (member checking, thick description, audit trail).",
    "~80 words: Ethics and positionality. State: IRB/ethics board approval (institution name), informed consent procedure, data anonymisation, storage protocol (encrypted, duration), right to withdraw. For qualitative: state the researcher's positionality and how reflexivity was managed."
  ],

  "results_placeholders": [
    "[RESEARCHER — COMPULSORY — Preliminary Analyses (~150 words): Before main results, you must report: (1) Descriptive statistics table reference (Table 1: means, SDs, ranges, and bivariate correlations for all study variables). (2) Assumption checks — for quantitative: normality (Shapiro-Wilk or skewness/kurtosis values), homoscedasticity, multicollinearity (VIF < 10, tolerance > .10), common method bias (Harman single factor < 50%); for qualitative: inter-rater reliability (Cohen's κ > .70) or reflexivity log. (3) Any data cleaning decisions (outlier removal, missing data handling). Format: 'Preliminary analyses confirmed multivariate normality (Mardia's coefficient = X.XX). Variance inflation factors ranged from X.XX to X.XX, indicating no multicollinearity concerns. Harman's single-factor test extracted X factors accounting for X.X% of variance, below the 50% threshold (Podsakoff et al., 2003)...']",
    "[RESEARCHER — COMPULSORY — Main Results: H1 (~250 words): Test and report H1. REQUIRED elements for quantitative: (1) Hierarchical regression/ANOVA/SEM table reference (Table 2). (2) Exact test statistic: 'Hierarchical regression analysis revealed that [predictor] significantly predicted [outcome] (β = X.XX, SE = X.XX, t(df) = X.XX, p = .XXX, 95% CI [X.XX, X.XX]), explaining an additional X.X% of variance (ΔR² = X.XX, ΔF(1, N-2) = X.XX, p = .XXX).' (3) Effect size interpretation per Cohen (1988): small (β/d < .20), medium (.20–.50), large (> .50). (4) Explicit statement: 'These results support [fail to support] H1.' REQUIRED for qualitative: (1) Theme name, definition, illustrative verbatim quote with participant identifier, (2) frequency/prevalence across data sources, (3) link to theoretical proposition.']",
    "[RESEARCHER — COMPULSORY — Main Results: H2/H3 and Additional Findings (~200 words): Report H2 and H3 with the same precision as above. If moderation (H2): report the interaction term (ΔR² for interaction block, β for interaction term, p-value, and the simple slopes at ±1 SD of moderator — create and reference Figure 1: interaction plot). If mediation: report indirect effect via bootstrapped 95% CI (PROCESS Model 4 or 6; Hayes, 2022). Explicitly state: 'The indirect effect was significant: b=X.XX, SE=X.XX, 95% CI [X.XX, X.XX], κ²=X.XX.' Report any significant control variable effects, subgroup analyses, or unexpected findings with their statistics. Close the Results section with a brief summary table statement: 'Table 3 summarises the hypothesis testing outcomes.'"]
  ],

  "discussion_paragraphs": [
    "[RESEARCHER — COMPULSORY (~160 words): Open the Discussion with your single most important finding stated plainly, then IMMEDIATELY situate it theoretically and empirically. Required structure: 'The primary finding of this study — that [your finding] — [supports/challenges/extends] [specific theory] (Author, Year) by demonstrating [mechanism]. This aligns with [Author et al., Year]'s argument that [related finding], while contrasting with [Author & Author, Year]'s cross-sectional evidence suggesting [opposing result]. The discrepancy may be attributable to [specific methodological or contextual explanation]. For H2, [your moderation/mediation result] indicates that [theoretical implication of the interaction/indirect effect].' Do NOT write this in general terms — every sentence must name a specific study or theory.]",
    "~160 words: Theoretical contributions. State precisely which theory is extended and HOW. Introduce any new construct, boundary condition, or mechanism this study identifies. Use language such as: 'Theoretically, this study makes three contributions. First, it extends [theory] to [new context/population], demonstrating that [theoretical assumption] holds [does not hold] under [specific condition]. Second, the moderating role of [variable] establishes [construct] as a previously unrecognised boundary condition for [theory]. Third, by integrating [theory 1] with [theory 2], this study proposes a [name] framework that...'. Cite 3 recent papers that this study advances beyond.",
    "~130 words: Practical implications. Be specific about who benefits and how: 'For [specific role/function] in [specific industry/context], these findings suggest that [specific actionable recommendation]. Specifically, [organisation type] should [specific intervention] because [evidence-based rationale]. This is particularly relevant in light of [specific policy/regulation/industry trend]. [Second recommendation with similar specificity].' Cite at least one industry report, policy document, or practitioner framework to ground the recommendations.",
    "[RESEARCHER — COMPULSORY (~130 words): Limitations. You must honestly address ALL of the following that apply: (1) Cross-sectional design — inability to establish causality; suggest how a longitudinal design would strengthen inference. (2) Sample generalisability — who is excluded, what populations your findings may not apply to. (3) Self-report bias — common method variance despite precautions; state what Harman's test indicated. (4) Social desirability threats to validity. (5) Any construct validity concerns with the scales used. (6) Geographic or industry specificity. Format: 'This study is not without limitations. First, the cross-sectional design precludes causal inference; future longitudinal work should... Second, the sample of [description] limits generalisability to [other population]...' Acknowledging limitations strengthens credibility — do not minimise them.]"
  ],

  "conclusion_paragraphs": [
    "[RESEARCHER — COMPULSORY (~100 words): Summarise your key findings in plain-language prose — not a bulleted list, but 3 flowing sentences each answering one research question. Format: 'This study examined [topic] among [sample]. Results demonstrated [finding for RQ1], while [finding for RQ2]. Regarding RQ3, [finding for RQ3]. Collectively, these findings suggest that [overarching theoretical insight].' Do NOT introduce new information here. Do NOT copy from the abstract.]",
    "~110 words: Contribution — restate the theoretical and practical significance with finality. What does the scholarly community now know that it did not before this study? What should change in how practitioners approach [domain]? Frame as: 'This study contributes to the [field] literature by... Practically, it demonstrates that... In doing so, it responds to calls by [Author, Year] and [Author, Year] for research on...'",
    "~80 words: Future research agenda with 3 specific, actionable directions that directly follow from your limitations and findings. Each should be operationally specific: 'Future research should employ longitudinal panel designs tracking [variable] at [interval] to establish [causal mechanism]...' — not 'future research should explore this topic further.'"
  ],

  "references": ["Full APA 7th edition for every paper cited in the draft — include DOI. Format: Author, A. A., & Author, B. B. (Year). Title of article. Journal Name, Volume(Issue), pages. https://doi.org/xxxxx"]
}`;

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 7000,
      system: "You are a senior academic editor. Output ONLY raw JSON — no markdown, no code fences, no preamble. Start with { end with }. Every factual claim must cite a specific study.",
      messages: [{ role: "user", content: prompt }],
    });

    let text = message.content[0].text.trim();
    text = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
    const f = text.indexOf("{"), l = text.lastIndexOf("}");
    if (f > 0) text = text.slice(f);
    if (l < text.length - 1) text = text.slice(0, l + 1);
    const normalized = normalizePaper(JSON.parse(text));
    return res.status(200).json({ result: JSON.stringify(normalized) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Draft generation failed. Please try again.", detail: err.message });
  }
}
