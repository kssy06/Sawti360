import { MessageCircle } from "lucide-react";

/** « Envoyer par WhatsApp » next to « Copier le lien »: the fallback when no e-mail could be sent. */
export function WhatsAppButton({ text, url, label = "Envoyer par WhatsApp" }: { text: string; url: string; label?: string }) {
  if (!url) return null;
  return (
    <a className="btn btn-secondary btn-sm" href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`} target="_blank" rel="noreferrer">
      <MessageCircle />
      {label}
    </a>
  );
}
