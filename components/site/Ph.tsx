/** Contact detail that links itself: emails become mailto:, phone numbers tel:, anything else plain text. */
export function Ph({ text }: { text: string }) {
  if (text.includes("@")) return <a href={`mailto:${text}`} className="hover:text-primary">{text}</a>;
  if (/^\+?[\d\s-]{8,}$/.test(text)) return <a href={`tel:${text.replace(/\s/g, "")}`} className="hover:text-primary">{text}</a>;
  return <>{text}</>;
}
