/**
 * Natural ordering for names that mix text and numbers: "Gi1/0/2" before
 * "Gi1/0/10", "port9" before "port10". Names the collator considers equal
 * (case or accent differences only) fall back to plain code-point order, so
 * the result never depends on input order.
 */
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

export function naturalCompare(a, b) {
	const first = String(a);
	const second = String(b);
	const order = collator.compare(first, second);
	if (order !== 0) {
		return order;
	}
	return first < second ? -1 : first > second ? 1 : 0;
}
