/**
 * Estimated radio coverage for the Wireless Floor Map (C34).
 *
 * This is a model, not a measurement, and is always labelled as one. It uses
 * the ITU-R P.1238 indoor path loss model on one floor:
 *
 *   L(d) = 20·log10(f) + N·log10(d) − 28      (L in dB, f in MHz, d in metres)
 *
 * so the distance at which a radio transmitting at P dBm (EIRP) falls to a
 * signal level S dBm is
 *
 *   d = 10 ^ ((P − S − 20·log10(f) + 28) / N)
 *
 * Walls, furniture and people are not included, so real coverage is usually
 * smaller. The inputs are all real or explicit: the radio's transmit power
 * item (or a power the user enters), its channel's centre frequency, the
 * distance loss coefficient N per band (from the settings), and the floor
 * plan's real width in metres (from the settings).
 */
import { toNumber } from './normalise.js';

/** Number of contour rings drawn per radio, one per signal level. */
export const LEVELS = 9;

/** Signal step between contour rings, in dB. */
export const LEVEL_STEP = 4;

/** Band centre frequencies in MHz, used when the channel is not a number. */
const BAND_CENTRE = Object.freeze({ '2.4': 2437, 5: 5500, 6: 6475 });

/**
 * Centre frequency in MHz of a channel on a band (IEEE 802.11 channel
 * numbering: 2.4 GHz from 2407 MHz, channel 14 at 2484 MHz; 5 GHz from
 * 5000 MHz; 6 GHz from 5950 MHz), or the band centre when the channel is
 * unknown or out of range.
 */
export function channelFrequency(band, channel) {
	const number = toNumber(String(channel ?? '').trim());
	if (number !== null && Number.isInteger(number) && number > 0) {
		if (band === '2.4' && number <= 14) {
			return number === 14 ? 2484 : 2407 + 5 * number;
		}
		if (band === '5' && number >= 32 && number <= 177) {
			return 5000 + 5 * number;
		}
		if (band === '6' && number <= 233) {
			return 5950 + 5 * number;
		}
	}
	return BAND_CENTRE[band];
}

/** Path loss in dB at a distance in metres. */
export function pathLoss(frequency, distance, coefficient) {
	return 20 * Math.log10(frequency) + coefficient * Math.log10(distance) - 28;
}

/** Distance in metres at which the signal falls to `level` dBm, or 0 when it never reaches it. */
export function rangeTo(power, level, frequency, coefficient) {
	const exponent = (power - level - 20 * Math.log10(frequency) + 28) / coefficient;
	const distance = 10 ** exponent;
	// Closer than 1 m the model does not apply.
	return distance >= 1 ? distance : 0;
}

/** Parses the coverage settings: { width, edge, power, coefficients, errors }. */
export function coverageSettings(config) {
	const errors = [];
	const width = toNumber(String(config.plan_width ?? '').trim());
	if (width === null || !(width > 0) || width > 100000) {
		errors.push('Enter the real width of the floor plan in metres, for example "60".');
	}
	const edge = toNumber(String(config.edge_level ?? '').trim());
	if (edge === null || edge < -100 || edge > -30) {
		errors.push('The coverage edge must be a signal level from -100 to -30 dBm, for example "-67".');
	}
	const powerText = String(config.tx_power_default ?? '').trim();
	const power = powerText === '' ? null : toNumber(powerText);
	if (powerText !== '' && (power === null || power < -10 || power > 36)) {
		errors.push('The default transmit power must be from -10 to 36 dBm, or empty.');
	}
	const parts = String(config.path_loss_n ?? '').split(',').map((part) => toNumber(part.trim()));
	const coefficients = parts.length === 3 && parts.every((part) => part !== null && part >= 10 && part <= 60)
		? { '2.4': parts[0], 5: parts[1], 6: parts[2] }
		: null;
	if (coefficients === null) {
		errors.push('The distance loss coefficients must be three numbers from 10 to 60 for 2.4, 5 and 6 GHz, for example "28, 31, 31".');
	}
	return { width, edge, power, coefficients, errors };
}

/**
 * Contour rings for one radio, outermost first: [{ level, radius }] with the
 * radius in metres, for signal levels from the edge upwards in LEVEL_STEP dB
 * steps. Levels the radio never reaches are left out. Returns [] without a
 * transmit power.
 */
export function contours(radio, settings) {
	const power = radio.txPower ?? settings.power;
	if (power === null || power === undefined || settings.coefficients === null || settings.edge === null) {
		return [];
	}
	const frequency = channelFrequency(radio.band, radio.channel);
	const coefficient = settings.coefficients[radio.band];
	const rings = [];
	for (let index = 0; index < LEVELS; index++) {
		const level = settings.edge + index * LEVEL_STEP;
		const radius = rangeTo(power, level, frequency, coefficient);
		if (radius > 0) {
			rings.push({ level, radius });
		}
	}
	return rings;
}

/** Columns in the coverage grid across the floor plan. */
export const GRID_COLUMNS = 96;

/**
 * The spectrum a radio occupies, as [low, high] MHz, from its band, channel
 * and channel width (20 MHz when the width is unknown).
 *
 * - 5 and 6 GHz: wider channels are fixed blocks of 20 MHz channels (for
 *   example 36-48 for 80 MHz), so the block holding the channel is used.
 * - 2.4 GHz: a 40 MHz channel's second half may sit above or below the
 *   primary channel and the item does not say which, so both sides are
 *   counted.
 * Returns null when the channel is not a number.
 */
export function spectrum(radio) {
	const channel = toNumber(String(radio.channel ?? '').trim());
	if (channel === null || !Number.isInteger(channel)) {
		return null;
	}
	const width = [20, 40, 80, 160, 320].includes(radio.width) ? radio.width : 20;
	const centre = channelFrequency(radio.band, channel);
	if (radio.band === '2.4') {
		return width > 20 ? [centre - 10 - (width - 20), centre + 10 + (width - 20)] : [centre - 10, centre + 10];
	}
	const base = radio.band === '5' ? (channel >= 149 ? 149 : 36) : 1;
	const index = (channel - base) / 4;
	if (!Number.isInteger(index) || index < 0) {
		return [centre - width / 2, centre + width / 2];
	}
	const size = width / 20;
	const first = Math.floor(index / size) * size;
	const low = channelFrequency(radio.band, base + first * 4) - 10;
	return [low, low + width];
}

/** Whether two radios share any spectrum (same band, overlapping frequencies). */
export function spectrumOverlap(a, b) {
	if (a.band !== b.band) {
		return false;
	}
	const first = spectrum(a);
	const second = spectrum(b);
	return first !== null && second !== null && first[0] < second[1] && second[0] < first[1];
}

/** The coverage grid's shape over a plan: { columns, rows, size } with size in metres. */
export function gridShape(planWidth, planHeight) {
	const columns = GRID_COLUMNS;
	const size = planWidth / columns;
	return { columns, rows: Math.max(1, Math.round(planHeight / size)), size };
}

/**
 * The estimated signal across the floor plan, on a grid of cells.
 *
 * `sources` are [{ ap, radio, x, y }] with x and y in metres from the plan's
 * top left. Returns { columns, rows, size, gaps, clashes } where size is the
 * cell size in metres, gaps lists cells no radio reaches at the edge level,
 * and clashes lists cells where two radios on overlapping spectrum both
 * reach it: [{ column, row, radios: [{ ap, radio, level }] }].
 *
 * `inside(column, row)`, when given, says which cells are inside the
 * building; cells outside it are neither gaps nor clashes.
 */
export function coverageGrid(sources, settings, planWidth, planHeight, inside = null) {
	const { columns, rows, size } = gridShape(planWidth, planHeight);
	const powered = sources
		.map((source) => ({ ...source, power: source.radio.txPower ?? settings.power }))
		.filter((source) => source.power !== null && source.power !== undefined)
		.map((source) => ({
			...source,
			frequency: channelFrequency(source.radio.band, source.radio.channel),
			coefficient: settings.coefficients[source.radio.band]
		}));
	const gaps = [];
	const clashes = [];
	if (powered.length === 0) {
		// Without any transmit power there is nothing to estimate, not a floor without coverage.
		return { columns, rows, size, gaps, clashes };
	}
	for (let row = 0; row < rows; row++) {
		for (let column = 0; column < columns; column++) {
			if (inside !== null && !inside(column, row)) {
				continue;
			}
			const cx = (column + 0.5) * size;
			const cy = (row + 0.5) * size;
			const heard = [];
			for (const source of powered) {
				const distance = Math.max(1, Math.hypot(cx - source.x, cy - source.y));
				const level = source.power - pathLoss(source.frequency, distance, source.coefficient);
				if (level >= settings.edge) {
					heard.push({ ap: source.ap, radio: source.radio, level });
				}
			}
			if (heard.length === 0) {
				gaps.push({ column, row });
				continue;
			}
			const clashing = heard.filter((entry) => heard.some((other) => other !== entry && other.ap !== entry.ap && spectrumOverlap(entry.radio, other.radio)));
			if (clashing.length > 0) {
				clashes.push({ column, row, radios: clashing });
			}
		}
	}
	return { columns, rows, size, gaps, clashes };
}
