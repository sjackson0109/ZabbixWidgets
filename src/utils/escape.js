const ENTITIES = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;'
};

/**
 * Escapes text for insertion into HTML. Host, item and tag names are user
 * controlled, so every label that reaches a tooltip passes through here.
 */
export function escapeHtml(value) {
	return String(value ?? '').replace(/[&<>"']/g, (char) => ENTITIES[char]);
}
