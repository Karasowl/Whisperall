export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function safeHtmlParagraphs(text: string): string {
  return text.split('\n').map((l) => `<p>${escapeHtml(l) || '<br>'}</p>`).join('');
}
