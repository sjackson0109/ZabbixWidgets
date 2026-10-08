/**
 * Fixed node positions for the network diagram: one "host name = x, y" per
 * line, written by the user. x runs left to right and y top to bottom; the
 * diagram is scaled to fit the widget, so any consistent units work (0 to
 * 100 is a convenient grid). A host without a line has no position and is
 * not drawn in the fixed layout: positions are never made up.
 */

/** Returns { positions: Map(name -> [x, y]), errors: [{ line, text }], duplicates: [name] }. */
export function parseNodePositions(text) {
	const positions = new Map();
	const errors = [];
	const duplicates = [];

	String(text ?? '').split(/\r?\n/).forEach((raw, index) => {
		const line = raw.trim();
		if (line === '' || line.startsWith('#')) {
			return;
		}
		const separator = line.lastIndexOf('=');
		const name = separator === -1 ? '' : line.slice(0, separator).trim();
		const coordinates = separator === -1 ? [] : line.slice(separator + 1).split(',').map((part) => part.trim());
		const [x, y] = coordinates.map(Number);
		if (name === '' || coordinates.length !== 2 || coordinates.some((part) => part === '') || !Number.isFinite(x) || !Number.isFinite(y)) {
			errors.push({ line: index + 1, text: line });
			return;
		}
		if (positions.has(name)) {
			duplicates.push(name);
		}
		positions.set(name, [x, y]);
	});

	return { positions, errors, duplicates };
}
