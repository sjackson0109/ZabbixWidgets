export function debounce(fn, wait) {
	let timer = null;

	const debounced = (...args) => {
		clearTimeout(timer);
		timer = setTimeout(() => {
			timer = null;
			fn(...args);
		}, wait);
	};

	debounced.cancel = () => {
		clearTimeout(timer);
		timer = null;
	};

	return debounced;
}
