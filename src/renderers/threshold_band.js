/**
 * C26 Threshold Band: the temporal line over coloured operating bands taken
 * from the configured thresholds (numbers or macros shared by the selected
 * hosts), with an optional target line. The value axis always spans the
 * data, the thresholds and the target.
 */
import { buildTemporalOption } from './temporal.js';

export default {
	id: 'threshold_band',
	buildOption: (payload, context) => buildTemporalOption(payload, context, { kind: 'bands' })
};
