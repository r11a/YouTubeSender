const tones = {
  personal: "אישי וחם", professional: "מקצועי וברור", marketing: "מסקרן ושיווקי", short: "קצר מאוד"
};

export const recommendedModel = (provider) => provider === "openai" ? "gpt-5.6-luna" : provider === "gemini" ? "gemini-3.5-flash-lite" : "local";

export async function testAiConnection({ provider, apiKey, model }) {
  if (provider === "local") return { ok: true, service: "ai", model: "local", message: "המחולל המקומי זמין ללא Token" };
  if (!apiKey) throw new Error("AI API Token לא הוגדר");
  const selected = !model || model === "auto" ? recommendedModel(provider) : model;
  if (provider === "openai") {
    const response = await fetch("https://api.openai.com/v1/models", { headers: { authorization: `Bearer ${apiKey}` } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "OpenAI API אינו זמין");
    return { ok: true, service: "ai", model: selected, message: `OpenAI זמין · ${selected}` };
  }
  if (provider === "gemini") {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${selected}?key=${encodeURIComponent(apiKey)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Gemini API אינו זמין");
    return { ok: true, service: "ai", model: selected, message: `Gemini זמין · ${selected}` };
  }
  throw new Error("ספק AI אינו נתמך");
}

export async function generateMessage({ provider, apiKey, model, video, tone = "personal", detailed = false }) {
  if (provider === "local" || !apiKey) {
    const intro = tone === "professional" ? "בסרטון החדש אני מציג" : tone === "marketing" ? "עלה סרטון חדש ששווה לראות:" : "רציתי לשתף אתכם בסרטון החדש שלי:";
    const description = String(video.description || "").replace(/\s+/g, " ").trim().slice(0, detailed ? 520 : 180);
    return detailed ? `${intro}\n\n${video.title}\n\n${description || "בסרטון תוכלו להכיר את הנושא מקרוב ולראות את הפרטים בצורה ברורה ונעימה."}\n\nאם הנושא מעניין אתכם, אני מזמין אתכם לצפות ולשתף מה חשבתם.\n\nלצפייה 👇\n${video.url}` : `${intro}\n\n${video.title}\n\n${description}\n\nלצפייה 👇\n${video.url}`;
  }
  const prompt = `כתוב הודעת הפצה בעברית, בסגנון ${tones[tone] || tones.personal}, ${detailed ? "מפורטת, נעימה ומסקרנת, 90–140 מילים" : "עד 70 מילים"}. הסבר בבירור מה רואים או לומדים בסרטון, למה כדאי לצפות בו, וסיים בהזמנה טבעית לצפייה. אל תמציא עובדות שאינן בכותרת או בתיאור. כותרת: ${video.title}\nתיאור: ${video.description}\nקישור: ${video.url}`;
  if (provider === "openai") {
    const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body: JSON.stringify({ model: !model || model === "auto" ? recommendedModel(provider) : model, input: prompt }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "שגיאת OpenAI");
    return data.output_text || data.output?.flatMap((item) => item.content || []).find((item) => item.text)?.text;
  }
  if (provider === "gemini") {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${!model || model === "auto" ? recommendedModel(provider) : model}:generateContent?key=${encodeURIComponent(apiKey)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "שגיאת Gemini");
    return data.candidates?.[0]?.content?.parts?.[0]?.text;
  }
  throw new Error("ספק AI אינו נתמך");
}
