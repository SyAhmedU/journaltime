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

  const userPrompt = `Research topic: "${topic}"${field ? `\nField: ${field}` : ""}

Available journals:
${journalContext}

Return ONLY valid JSON (no markdown, no code fences, no explanation) with this exact structure:
{
  "tree": {
    "name": "<topic label, max 5 words>",
    "children": [
      {
        "name": "<theme, max 4 words>",
        "children": [
          {
            "name": "<aspect, max 5 words>",
            "type": "studied",
            "citation": "<Author (Year)> or null",
            "detail": "<one sentence max>"
          },
          {
            "name": "<gap, max 5 words>",
            "type": "gap",
            "method": "Survey|Experiment|Qualitative|Mixed Methods|Longitudinal|Meta-Analysis",
            "detail": "<why understudied, one sentence max>"
          }
        ]
      }
    ]
  },
  "journals": [
    { "name": "<journal from list>", "reason": "<one sentence>", "competition": "High|Medium|Low" }
  ],
  "keywords": ["kw1", "kw2", "kw3", "kw4", "kw5", "kw6", "kw7", "kw8"]
}

Rules:
- Exactly 4 theme branches
- Each branch has 3–4 children (mix of studied and gap; gaps should outnumber studied)
- Citations: only real known authors/years — use null if unsure
- All "name" fields MUST be 3–5 words max (tree labels)
- Exactly 5 journals from the list above
- 6–8 keywords`;

  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: "You are a research analysis tool. Output ONLY raw JSON — no markdown, no code fences, no preamble, no explanation. Start your response with { and end with }.",
        },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 2000,
      temperature: 0.2,
    });

    let text = completion.choices[0].message.content.trim();
    text = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
    JSON.parse(text); // validate before returning
    return res.status(200).json({ result: text });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Analysis failed. Please try again.", detail: err.message });
  }
}
