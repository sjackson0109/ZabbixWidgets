/**
 * Small DOM builder for the HTML renderers. Text always goes in as text
 * nodes, so names from Zabbix are never interpreted as markup.
 */
export function el(tag, { className, text, title, attrs, style, on } = {}, children = []) {
	const element = document.createElement(tag);
	if (className) {
		element.className = className;
	}
	if (text !== undefined && text !== null) {
		element.textContent = String(text);
	}
	if (title) {
		element.title = title;
	}
	for (const [name, value] of Object.entries(attrs ?? {})) {
		if (value !== undefined && value !== null && value !== false) {
			element.setAttribute(name, value === true ? '' : String(value));
		}
	}
	for (const [name, value] of Object.entries(style ?? {})) {
		element.style.setProperty(name, value);
	}
	for (const [event, handler] of Object.entries(on ?? {})) {
		element.addEventListener(event, handler);
	}
	element.append(...children.filter((child) => child !== null && child !== undefined && child !== false));
	return element;
}

/**
 * Replaces a renderer's content while keeping keyboard focus (and the caret
 * in a text box) on the element with the same data-zw-focus key, so a
 * refresh does not interrupt someone typing a filter.
 */
export function replaceKeepingFocus(container, build) {
	const active = container.ownerDocument.activeElement;
	const key = active && container.contains(active) ? active.dataset?.zwFocus : undefined;
	const selection = key !== undefined && typeof active.selectionStart === 'number'
		? [active.selectionStart, active.selectionEnd]
		: null;

	container.replaceChildren(build());

	if (key !== undefined) {
		const target = container.querySelector(`[data-zw-focus="${key}"]`);
		target?.focus();
		if (selection !== null && typeof target?.setSelectionRange === 'function') {
			target.setSelectionRange(...selection);
		}
	}
}
