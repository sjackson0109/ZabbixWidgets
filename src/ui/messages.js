/**
 * Renders validation errors and warnings inside the widget with DOM text
 * nodes, so names from Zabbix are never interpreted as HTML.
 */
export function renderMessages(container, { errors = [], warnings = [] }) {
	container.replaceChildren();

	const list = (problems, className) => {
		if (problems.length === 0) {
			return;
		}
		const element = document.createElement('ul');
		element.className = className;
		for (const problem of problems) {
			const entry = document.createElement('li');
			entry.textContent = problem.message;
			element.append(entry);
		}
		container.append(element);
	};

	list(errors, 'zw-charts-errors');
	list(warnings, 'zw-charts-warnings');
	container.hidden = errors.length === 0 && warnings.length === 0;
}
