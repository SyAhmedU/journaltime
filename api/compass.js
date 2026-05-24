import { generateText } from "ai";

// AI Gateway: large analytical prompt — needs a strong reasoning model.
// Override via JOURNALTIME_COMPASS_MODEL.
const COMPASS_MODEL = process.env.JOURNALTIME_COMPASS_MODEL || "anthropic/claude-sonnet-4.6";
const COMPASS_FALLBACK = ["anthropic/claude-opus-4.6", "openai/gpt-5.4"];

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { topic, field, journals, meta } = req.body;
  if (!topic || topic.trim().length < 5) {
    return res.status(400).json({ error: "Please enter a more detailed research topic." });
  }

  const relevant = journals
    .filter(j => !field || j.field === field)
    .sort((a, b) => b.impact_factor - a.impact_factor)
    .slice(0, 50);

  const journalContext = relevant.map(j => {
    const m = meta[j.id];
    const themes = m?.themes?.join(", ") || "general research";
    return `• ${j.name} (${j.field}, IF:${j.impact_factor}). Themes: ${themes}.`;
  }).join("\n");

  const userPrompt = `You are a PhD supervisor giving a doctoral student a comprehensive research landscape briefing.

Topic: "${topic}"${field ? `\nField: ${field}` : ""}

Available journals:
${journalContext}

Return ONLY raw JSON (no markdown, no code fences, no explanation). Structure:
{
  "tree": {
    "name": "<5-word topic label>",
    "children": [
      {
        "name": "<3-4 word theme>",
        "children": [
          {
            "name": "<4-5 word specific aspect>",
            "type": "studied",
            "papers": [
              { "title": "<exact paper title>", "authors": "<First Author et al.>", "year": 2019, "doi": "<real DOI or null>" }
            ],
            "finding": "<key finding in 1 sentence>"
          },
          {
            "name": "<4-5 word contested area>",
            "type": "debate",
            "papers": [
              { "title": "<paper on one side>", "authors": "<Author>", "year": 2020, "doi": null },
              { "title": "<paper on other side>", "authors": "<Author>", "year": 2022, "doi": null }
            ],
            "finding": "<what the disagreement is, 1 sentence>"
          },
          {
            "name": "<4-5 word understudied gap>",
            "type": "gap",
            "method": "Survey|Experiment|Qualitative|Mixed Methods|Longitudinal|Meta-Analysis|Computational|Case Study",
            "rationale": "<why this is understudied, 1 sentence>",
            "feasibility": "High|Medium|Low"
          }
        ]
      }
    ]
  },
  "authors": [
    {
      "name": "<Full Name>",
      "affiliation": "<University or Institution>",
      "focus": "<research specialisation, 8 words max>",
      "known_for": "<their most influential work or contribution, 1 sentence>",
      "active": true
    }
  ],
  "journals": [
    { "name": "<journal from list>", "reason": "<one sentence>", "competition": "High|Medium|Low", "acceptance_rate": "<% if known, else null>" }
  ],
  "keywords": ["kw1","kw2","kw3","kw4","kw5","kw6","kw7","kw8"]
}

Critical rules:
- Exactly 5 theme branches covering: (1) Theoretical Foundations, (2) Core Empirical Findings, (3) Methodology Landscape, (4) Contextual & Population Gaps, (5) Emerging & Future Directions
- Each branch: 5 children. Composition per branch: 2 studied, 1 debate, 2 gap. This is mandatory.
- Papers: only cite REAL published papers you are highly confident about. Include 1-2 papers per studied/debate node. Use null for DOI only if you are unsure of the exact DOI.
- name fields: 4-5 words MAX (visual labels)
- finding/rationale: 1 sentence only, no filler words
- authors: 6 key researchers — 3 foundational (set active:false), 3 currently active (set active:true). Include researchers from different countries where possible.
- Exactly 5 journals from the provided list
- 8 keywords`;

  try {
    const { text: raw } = await generateText({
      model: COMPASS_MODEL,
      system: "You output ONLY raw JSON. No markdown, no code fences, no preamble, no commentary. Start with { and end with }.",
      prompt: userPrompt,
      maxOutputTokens: 3200,
      temperature: 0.15,
      providerOptions: {
        gateway: {
          models: COMPASS_FALLBACK,
          tags: ["project:journaltime", "feature:compass"],
        },
      },
    });

    let text = raw.trim();
    text = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace > 0) text = text.slice(firstBrace);
    if (lastBrace < text.length - 1) text = text.slice(0, lastBrace + 1);
    JSON.parse(text);
    return res.status(200).json({ result: text });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Analysis failed. Please try again.", detail: err.message });
  }
}
