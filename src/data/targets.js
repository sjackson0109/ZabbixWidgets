/**
 * Bullet graph inputs: one target per actual value, taken only from the
 * configured source (a paired item, a user macro or a constant), and the
 * optional qualitative range boundaries. Nothing here derives a target from
 * the actual value.
 */
import { pairSeries } from './pairing.js';
import { toNumber } from './normalise.js';

/**
 * Parses "50, 80" into ascending boundaries. Returns { ranges, error } where
 * error describes why the text could not be used.
 */
export function parseRanges(text) {
	const parts = String(text ?? '').split(',').map((part) => part.trim()).filter((part) => part !== '');
	const ranges = parts.map((part) => toNumber(part));
	if (ranges.some((value) => value === null)) {
		return { ranges: [], error: 'Qualitative ranges must be numbers separated by commas, for example 50, 80.' };
	}
	if (ranges.some((value, index) => index > 0 && value <= ranges[index - 1])) {
		return { ranges: [], error: 'Qualitative ranges must be in ascending order.' };
	}
	return { ranges, error: null };
}

/**
 * Bars for a bullet graph: [{ actual, target, label }]. Actuals whose target
 * cannot be resolved are left out; validation reports them.
 */
export function bulletBars(payload) {
	const { config } = payload;
	const actuals = payload.series.filter((entry) => entry.role === 'actual');

	switch (config.target_source) {
		case 'item': {
			const { tuples } = pairSeries(payload.series, ['actual', 'target'], { pairBy: config.pair_by, pairTag: config.pair_tag });
			return tuples.map(({ label, members }) => ({ actual: members.actual, target: members.target.value, label }));
		}
		case 'macro': {
			const macro = String(config.target_macro ?? '').trim();
			const hosts = new Map(payload.hosts.map((host) => [host.hostid, host]));
			return actuals
				.map((actual) => ({ actual, target: toNumber(hosts.get(actual.hostid)?.macros?.[macro]) }))
				.filter((bar) => bar.target !== null);
		}
		case 'constant': {
			const target = toNumber(String(config.target_constant ?? ''));
			return target === null ? [] : actuals.map((actual) => ({ actual, target }));
		}
		default:
			return [];
	}
}
