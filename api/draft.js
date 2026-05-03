import Groq from "groq-sdk";

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
    `- ${n.name} [${n.branchName}]: ${n.finding || ""}. Ref: ${(n.papers || []).map(p => `${p.authors} (${p.year}), "${p.title}"`).join("; ")}`
  ).join("\n");

  const debContext = debateNodes.map(n =>
    `- ${n.name}: ${n.finding || ""}. See: ${(n.papers || []).map(p => `${p.authors} (${p.year})`).join(" vs. ")}`
  ).join("\n");

  const authCtx = (authors || []).slice(0, 5).map(a => `${a.name} (${a.affiliation}): ${a.focus}`).join("; ");

  const prompt = `You are a PhD supervisor drafting a structured academic paper for a doctoral student.

TOPIC: ${topic}
GAP BEING ADDRESSED: "${gap.name}"
WHY THIS GAP EXISTS: ${gap.rationale || "understudied area"}
RESEARCH METHOD: ${gap.method}
THEME: ${branch.name}
TARGET JOURNAL: ${targetJournal || "academic journal"}
KEYWORDS: ${(keywords || []).join(", ")}
${researcherContext ? `RESEARCHER CONTEXT: ${researcherContext}\n` : ""}
ESTABLISHED LITERATURE TO DRAW FROM:
${litContext}

CONTESTED AREAS:
${debContext}

KEY RESEARCHERS: ${authCtx}

Write a complete PhD-level academic paper draft. Use [RESEARCHER: specific instruction] for every section needing original data or findings. Write full academic prose for literature-based sections.

Return ONLY raw JSON (no markdown, no fences):
{
  "title": "specific academic title addressing the gap",
  "abstract": "280-word structured abstract: Background (2 sentences) + Objective (1 sentence) + Method (2 sentences) + [RESEARCHER: Expected results — insert your key findings] + Significance (1 sentence)",
  "research_questions": ["RQ1: ...", "RQ2: ...", "RQ3: ..."],
  "intro_paragraphs": [
    "~100 words: broad field context, why this topic matters societally and academically, cite 2-3 key researchers by name and year",
    "~120 words: what the literature HAS established — reference specific studies from the existing literature list, show progression of knowledge",
    "~100 words: the gap — what is missing, why prior work has not addressed it, and the real-world consequence of this gap",
    "[RESEARCHER: ~80 words: your specific contribution — state your sample, context, data source, and briefly outline the paper structure (Section 2 reviews..., Section 3 presents...)]"
  ],
  "lit_review_sections": [
    { "heading": "specific thematic heading", "content": "~200-word synthesis of studies on this sub-theme with inline citations (Author, Year). End with a sentence on what remains unresolved." }
  ],
  "methodology_paragraphs": [
    "~80 words: research philosophy (ontological/epistemological position) and why it suits this gap",
    "~90 words: research design — specific design type for ${gap.method}, justify the choice over alternatives",
    "[RESEARCHER: Sample and data collection — describe your participants/data source, n=?, sampling strategy, location, time period, inclusion/exclusion criteria]",
    "~90 words: data analysis procedure — specific analytical approach for ${gap.method}, name the software/framework used",
    "~70 words: validity, reliability/trustworthiness, and ethics (institutional review, consent, confidentiality)"
  ],
  "results_guidance": "Provide 4 suggested subheadings for the Results section based on ${gap.method} with a 1-sentence description of what to present under each",
  "discussion_paragraphs": [
    "[RESEARCHER: Your key finding and what it means — then: This finding aligns with / contradicts / extends [specific study from the lit]. Explain why.]",
    "~90 words: theoretical contribution — how this study advances understanding in ${branch.name}, which theory is supported or challenged",
    "~80 words: practical implications for practitioners, managers, or policymakers",
    "[RESEARCHER: Limitations — describe sample size constraints, generalisability limits, methodological trade-offs of ${gap.method}]"
  ],
  "conclusion_paragraphs": [
    "[RESEARCHER: Summarise your 2-3 key findings in plain language — what did you find, and why does it matter?]",
    "~70 words: theoretical and practical contribution of this study to ${branch.name} literature",
    "~60 words: 2-3 specific future research directions that would build on this study"
  ],
  "future_directions": ["specific researchable direction 1", "specific researchable direction 2", "specific researchable direction 3"],
  "references": ["Full APA 7th edition reference for each paper cited above"]
}`;

  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: "Output ONLY raw JSON. No markdown, no code fences. Start with { end with }." },
        { role: "user", content: prompt },
      ],
      max_tokens: 3800,
      temperature: 0.15,
    });

    let text = completion.choices[0].message.content.trim();
    text = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
    const f = text.indexOf("{"), l = text.lastIndexOf("}");
    if (f > 0) text = text.slice(f);
    if (l < text.length - 1) text = text.slice(0, l + 1);
    JSON.parse(text);
    return res.status(200).json({ result: text });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Draft generation failed. Please try again.", detail: err.message });
  }
}
