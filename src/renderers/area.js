/**
 * C22 Temporal Area: the temporal line with filled areas, overlapping or
 * stacked. Stacking adds values up, so validation allows it only for one
 * additive unit; stacked series are aligned on shared buckets first.
 */
import { buildTemporalOption } from './temporal.js';

export default {
	id: 'area',
	buildOption: (payload, context) => buildTemporalOption(payload, context, { kind: 'area' })
};
