import Anthropic from "@anthropic-ai/sdk";

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

  // Build journal context — pick relevant journals based on field filter
  const relevant = journals
    .filter(j => !field || j.field === field)
    .sort((a, b) => b.impact_factor - a.impact_factor)
    .slice(0, 60);

  // Enrich with meta descriptions
  const journalContext = relevant.map(j => {
    const m = meta[j.id];
    const themes = m?.themes?.join(", ") || "general research";
    const gaps = m?.gap_areas?.join("; ") || "";
    const desc = m?.description || "";
    return `• ${j.name} (${j.field}, ${j.quartile}, IF:${j.impact_factor})${desc ? " — " + desc.split(".")[0] : ""}. Themes: ${themes}.${gaps ? " Known gaps: " + gaps : ""}`;
  }).join("\n");

  const systemPrompt = `You are an expert academic research advisor helping early-career researchers understand the publication landscape. You give practical, honest, and encouraging guidance. You explain things simply without being condescending.`;

  const userPrompt = `A researcher has the following research idea or topic:

"${topic}"
${field ? `\nTheir preferred field: ${field}` : ""}

Here are the key journals in our database (with their themes and known gaps):

${journalContext}

Please provide a structured research landscape analysis with EXACTLY these 5 sections using the headers below. Be specific and practical. Avoid generic advice. Explain as if talking to a smart but new researcher.

## 📚 What's Already Well-Covered
List 3–4 bullet points of themes/angles in this topic that are already extensively published. Be specific.

## 🔍 Research Gaps You Can Fill
List 4–5 specific, actionable gaps in this topic — things that haven't been studied enough or new angles emerging. These should be realistic for an early-career researcher.

## 🎯 Best Journals to Target
List exactly 5 journals from the database above that are the best fit for this topic. For each: journal name, why it fits in one sentence, and roughly how competitive it is (acceptance rate if you know it).

## 💡 Fresh Research Angles
Suggest 3–4 specific, novel research directions in this topic not yet fully explored. Think: new contexts, new populations, new methods, AI + this topic.

## 🔑 Search Keywords for Literature Review
Give 6–8 specific keywords/phrases the researcher should use when searching Google Scholar, Scopus, or Web of Science.`;

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    return res.status(200).json({ result: message.content[0].text });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Analysis failed. Please try again." });
  }
}
