/** C21 Temporal Line: item history as lines over the dashboard time period (see temporal.js). */
import { buildTemporalOption } from './temporal.js';

export default {
	id: 'line',
	buildOption: (payload, context) => buildTemporalOption(payload, context, { kind: 'line' })
};
