import Groq from "groq-sdk";

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

  const userPrompt = `You are a PhD supervisor briefing a doctoral student on the research landscape.

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
              { "title": "<full paper title>", "authors": "<First Author et al.>", "year": 2019, "doi": "<DOI or null>" }
            ],
            "finding": "<key finding, 1 sentence>"
          },
          {
            "name": "<4-5 word contested topic>",
            "type": "debate",
            "papers": [
              { "title": "<paper arguing one side>", "authors": "<Author>", "year": 2020, "doi": null },
              { "title": "<paper arguing other side>", "authors": "<Author>", "year": 2022, "doi": null }
            ],
            "finding": "<what the debate is about, 1 sentence>"
          },
          {
            "name": "<4-5 word gap>",
            "type": "gap",
            "method": "Survey|Experiment|Qualitative|Mixed Methods|Longitudinal|Meta-Analysis|Computational",
            "rationale": "<why understudied, 1 sentence>",
            "feasibility": "High|Medium|Low"
          }
        ]
      }
    ]
  },
  "journals": [
    { "name": "<journal from list>", "reason": "<one sentence>", "competition": "High|Medium|Low", "acceptance_rate": "<% if known, else null>" }
  ],
  "keywords": ["kw1","kw2","kw3","kw4","kw5","kw6","kw7","kw8"]
}

Critical rules:
- Exactly 5 theme branches. Cover: (1) Theoretical Foundations, (2) Empirical Findings, (3) Methodology Landscape, (4) Contextual & Population Gaps, (5) Emerging Directions
- Each branch: 4-5 children mixing studied, debate, and gap. Gaps must outnumber studied. At least 1 debate per branch.
- Papers: cite only REAL published papers you are highly confident about. 1-2 papers per studied/debate node. null DOI if unsure.
- Name fields: 4-5 words MAX — these are visual tree labels
- finding/rationale: 1 short sentence, no padding
- Exactly 5 journals from the provided list
- 8 keywords`;

  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: "You output ONLY raw JSON. No markdown, no code fences, no preamble. Start with { and end with }.",
        },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 2800,
      temperature: 0.15,
    });

    let text = completion.choices[0].message.content.trim();
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
