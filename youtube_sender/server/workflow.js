import { now } from "./lib.js";

export const pipelineStage = (video, campaigns = [], deliveries = []) => {
  if (deliveries.some(d => d.videoId === video.id && d.status === "sent")) return "sent";
  if (campaigns.some(c => c.videoIds?.includes(video.id) && c.status === "scheduled")) return "scheduled";
  if (campaigns.some(c => c.videoIds?.includes(video.id))) return "ready";
  return video.distributionStatus === "archived" ? "archived" : "new";
};

export function contactInSmartGroup(contact, group, deliveries = []) {
  if (group.type !== "smart") return group.contactIds?.includes(contact.id) || contact.groupIds?.includes(group.id);
  const rules = group.rules || {};
  if (rules.language && contact.language !== rules.language) return false;
  if (rules.country && contact.country !== rules.country) return false;
  if (rules.tag && !contact.tags?.includes(rules.tag)) return false;
  if (rules.neverSent && deliveries.some(d => d.contactId === contact.id && d.status === "sent")) return false;
  return contact.active !== false;
}

export function dailyWorkspace(data) {
  const stages = Object.fromEntries(["new","ready","scheduled","sent","archived"].map(key => [key, []]));
  for (const video of data.videos) stages[pipelineStage(video, data.campaigns, data.deliveries)].push(video);
  const today = new Date().toISOString().slice(0, 10);
  return {
    stages,
    scheduledToday: data.campaigns.filter(c => c.scheduledAt?.startsWith(today) && c.status === "scheduled"),
    drafts: data.campaigns.filter(c => c.status === "draft"),
    unread: data.notifications.filter(n => !n.read),
    tasks: data.tasks.filter(t => t.status !== "done").sort((a,b) => String(a.dueAt||"").localeCompare(String(b.dueAt||""))),
    recommendation: stages.new.length ? `יש ${stages.new.length} סרטונים חדשים שמחכים להכנת מלל והפצה.` : data.campaigns.some(c=>c.status==="draft") ? "יש טיוטת הפצה שממתינה להשלמה." : "הכול מסודר. אפשר להכין את ההפצה הבאה."
  };
}

export async function runAutomations(store, trigger, context = {}) {
  const results = [];
  for (const rule of store.data.automations.filter(r => r.enabled !== false && r.trigger === trigger)) {
    const videos = context.videoIds?.map(id => store.get("videos", id)).filter(Boolean) || [];
    let matched = videos;
    if (rule.conditions?.folder) matched = matched.filter(v => v.folder === rule.conditions.folder);
    if (rule.conditions?.excludeShorts !== false) matched = matched.filter(v => v.contentType !== "short");
    if (rule.action === "create_draft" && matched.length) await store.create("campaigns", "cam", { name: rule.name, videoIds: matched.map(v=>v.id), contactIds: [], messages: {}, status: "draft", sourceAutomationId: rule.id });
    if (rule.action === "create_task" && matched.length) await store.create("tasks", "tsk", { title: `${rule.name}: ${matched.length} סרטונים`, videoIds: matched.map(v=>v.id), status: "open", dueAt: rule.dueAt || null });
    rule.lastRunAt = now(); rule.runCount = (rule.runCount || 0) + 1; results.push({ id: rule.id, matched: matched.length });
  }
  if (results.length) await store.save();
  return results;
}
