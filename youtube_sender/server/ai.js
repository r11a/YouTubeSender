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

export async function generateMessage({ provider, apiKey, model, video, tone = "personal" }) {
  if (provider === "local" || !apiKey) {
    const intro = tone === "professional" ? "בסרטון החדש אני מציג" : tone === "marketing" ? "עלה סרטון חדש ששווה לראות:" : "רציתי לשתף אתכם בסרטון החדש שלי:";
    return `${intro}\n\n${video.title}\n\n${String(video.description || "").split("\n")[0].slice(0, 180)}\n\nלצפייה 👇\n${video.url}`;
  }
  const prompt = `כתוב הודעה בעברית, בסגנון ${tones[tone] || tones.personal}, עד 70 מילים, להפצת סרטון. אל תמציא עובדות. כותרת: ${video.title}\nתיאור: ${video.description}\nקישור: ${video.url}`;
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
