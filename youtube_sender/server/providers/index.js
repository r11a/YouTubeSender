import { normalizePhone } from "../lib.js";

export const providers = {
  whatsapp: {
    id: "whatsapp", label: "WhatsApp", mode: "assisted",
    buildUrl({ recipient, message }) { return `https://wa.me/${normalizePhone(recipient.phone)}?text=${encodeURIComponent(message)}`; }
  },
  email: {
    id: "email", label: "Email", mode: "assisted",
    buildUrl({ recipient, subject, message }) { return `mailto:${encodeURIComponent(recipient.email || "")}?subject=${encodeURIComponent(subject || "סרטון חדש")}&body=${encodeURIComponent(message)}`; }
  },
  telegram: {
    id: "telegram", label: "Telegram", mode: "assisted",
    buildUrl({ message, videoUrl }) { return `https://t.me/share/url?url=${encodeURIComponent(videoUrl || "")}&text=${encodeURIComponent(message)}`; }
  }
};

export function prepareDelivery(providerId, values) {
  const provider = providers[providerId];
  if (!provider) throw new Error("ספק השליחה אינו נתמך");
  return { provider: providerId, mode: provider.mode, launchUrl: provider.buildUrl(values) };
}
