/** Contracts for C34 Wireless Floor Map: what it draws, what it leaves out, and why. */
import { describe, expect, it } from 'vitest';
import { getChart } from '../../src/registry/index.js';
import { validate } from '../../src/validation/index.js';
import { normaliseFloor } from '../../src/data/normalise.js';
import { apPositions, parseBand, parseWidth, wirelessModel } from '../../src/data/wireless.js';
import { channelFrequency, contours, coverageGrid, coverageSettings, gridShape, LEVELS, LEVEL_STEP, pathLoss, rangeTo, spectrum, spectrumOverlap } from '../../src/data/coverage.js';
import { host, item, payload } from '../fixtures/payload.js';

const FLOOR = { name: 'Floor 2', width: 400, height: 200, url: 'imgstore.php?iconid=12' };
const CONFIG = {
	floor_image: 'Floor 2', position_source: 'macros', position_macro_x: '{$WIFI.MAP.X}', position_macro_y: '{$WIFI.MAP.Y}', node_positions: '',
	radio_by: 'key', radio_tag: '', radio_regex: '', snr_thresholds: '15, 25', rogue_count: 'value',
	show_band_24: true, show_band_5: true, show_band_6: true,
	ring_size: 'model', plan_width: '50', tx_power_default: '15', edge_level: '-67', path_loss_n: '28, 31, 31'
};

function ap({ hostid = '1', name = 'ap-1', x = '50', y = '50', ...rest } = {}) {
	return { ...host({ hostid, name, ...rest }), position: { x, y } };
}

function radio(index, { hostid = '1', host: hostName = 'ap-1', band = '5', channel = '36', snr = '30', width = '80', tags = [] } = {}) {
	const common = { hostid, host: hostName, tags };
	return [
		item({ ...common, role: 'band', name: `Radio ${index} band`, key: `band[${index}]`, value_type: 1, units: '', value: band }),
		item({ ...common, role: 'channel', name: `Radio ${index} channel`, key: `channel[${index}]`, value_type: 3, units: '', value: channel }),
		item({ ...common, role: 'width', name: `Radio ${index} width`, key: `width[${index}]`, value_type: 3, units: 'MHz', value: width }),
		item({ ...common, role: 'snr', name: `Radio ${index} SNR`, key: `snr[${index}]`, units: 'dB', value: snr })
	];
}

function check(options) {
	return validate(getChart('wifi_floor'), payload('wifi_floor', { floor: FLOOR, hosts: [ap()], series: radio(1), ...options, config: { ...CONFIG, ...options.config } }));
}

const errors = (result) => result.errors.map((problem) => problem.code);
const warnings = (result) => result.warnings.map((problem) => problem.code);

describe('C34 bands and widths', () => {
	const band = (value, valuemap = null) => parseBand({ value, valuemap });

	it('reads GHz, MHz and mapped text', () => {
		expect(['2.4', '2.4 GHz', '2412', '5', '5GHz', '5180', '5.8', '6', '6 GHz', '6E', '5955'].map((value) => band(value)))
			.toEqual(['2.4', '2.4', '2.4', '5', '5', '5', '5', '6', '6', '6', '6']);
		expect(band(1, [{ type: 0, value: '1', newvalue: '2.4GHz' }, { type: 0, value: '2', newvalue: '5GHz' }])).toBe('2.4');
		expect(band(2, [{ type: 0, value: '1', newvalue: '2.4GHz' }, { type: 0, value: '2', newvalue: '5GHz' }])).toBe('5');
	});

	it('never guesses a band from anything else', () => {
		expect([band('36'), band('802.11ax'), band('unknown'), band(null)]).toEqual([null, null, null, null]);
	});

	it('reads channel widths from numbers and labels', () => {
		const width = (value) => parseWidth({ value, valuemap: null });
		expect([width(20), width('40MHz'), width('VHT80'), width('HE160'), width('25')]).toEqual([20, 40, 80, 160, null]);
	});
});

describe('C34 floor plan', () => {
	it('needs an image the server could load', () => {
		expect(errors(check({ floor: null }))).toContain('no_floor_image');
	});

	it('only accepts images served by Zabbix or embedded in the payload', () => {
		expect(normaliseFloor(FLOOR)).not.toBeNull();
		expect(normaliseFloor({ ...FLOOR, url: 'https://example.com/plan.png' })).toBeNull();
		expect(normaliseFloor({ ...FLOOR, url: 'imgstore.php?iconid=1&x=" onload="' })).toBeNull();
		expect(normaliseFloor({ ...FLOOR, width: 0 })).toBeNull();
	});
});

describe('C34 positions', () => {
	it('places hosts from their own macros, in percent of the floor plan', () => {
		const hosts = [ap(), ap({ hostid: '2', name: 'ap-2', x: '', y: '' }), ap({ hostid: '3', name: 'ap-3', x: '120', y: '5' })];
		const { placed, missing, invalid } = apPositions(payload('wifi_floor', { config: CONFIG, hosts }));
		expect([...placed]).toEqual([['1', [50, 50]]]);
		expect(missing).toEqual(['ap-2']);
		expect(invalid).toEqual(['ap-3']);
	});

	it('reports hosts without a position and refuses when none has one', () => {
		const result = check({ hosts: [ap({ x: '', y: '' })] });
		expect(errors(result)).toContain('no_position');
		expect(result.errors[0].message).toContain('{$WIFI.MAP.X}');
		const partial = check({ hosts: [ap(), ap({ hostid: '2', name: 'ap-2', x: '', y: '' })] });
		expect(partial.ok).toBe(true);
		expect(warnings(partial)).toContain('no_position');
	});

	it('reads the positions list instead when chosen', () => {
		const config = { position_source: 'list', node_positions: 'ap-1 = 10, 90\nghost = 1, 1\nbroken line' };
		const result = check({ config, hosts: [ap({ x: '', y: '' })] });
		expect(errors(result)).toContain('invalid_positions');
		const fixed = check({ config: { ...config, node_positions: 'ap-1 = 10, 90\nghost = 1, 1' }, hosts: [ap({ x: '', y: '' })] });
		expect(fixed.ok).toBe(true);
		expect(warnings(fixed)).toContain('unknown_positions');
	});
});

describe('C34 radios', () => {
	it('groups items into radios by key parameter and orders them by band', () => {
		const series = [...radio(2, { band: '5' }), ...radio(1, { band: '2.4', channel: '6', width: '20' })];
		const { aps } = wirelessModel(payload('wifi_floor', { config: CONFIG, hosts: [ap()], series, floor: FLOOR }));
		expect(aps[0].radios.map((entry) => [entry.id, entry.band, entry.channel, entry.width, entry.snr])).toEqual([
			['1', '2.4', '6', 20, 30], ['2', '5', '36', 80, 30]
		]);
	});

	it('groups by item tag or by a part of the item name when chosen', () => {
		const tagged = [...radio(1, { tags: [{ tag: 'radio', value: 'r0' }] })];
		const byTag = wirelessModel(payload('wifi_floor', { config: { ...CONFIG, radio_by: 'tag', radio_tag: 'radio' }, hosts: [ap()], series: tagged, floor: FLOOR }));
		expect(byTag.aps[0].radios.map((entry) => entry.id)).toEqual(['r0']);
		const byName = wirelessModel(payload('wifi_floor', { config: { ...CONFIG, radio_by: 'regex', radio_regex: '^Radio (\\d+)' }, hosts: [ap()], series: radio(3), floor: FLOOR }));
		expect(byName.aps[0].radios.map((entry) => entry.id)).toEqual(['3']);
	});

	it('needs a tag name and a valid expression', () => {
		expect(errors(check({ config: { radio_by: 'tag', radio_tag: '' } }))).toContain('no_radio_tag');
		expect(errors(check({ config: { radio_by: 'regex', radio_regex: 'Radio \\d+' } }))).toContain('invalid_radio_expression');
	});

	it('leaves out radios without a known band, and refuses when none is left', () => {
		const result = check({ series: [...radio(1, { band: '36' }), ...radio(2)] });
		expect(result.ok).toBe(true);
		expect(warnings(result)).toContain('no_band');
		expect(errors(check({ series: radio(1, { band: '' }) }))).toContain('no_radios');
	});

	it('leaves out radios where one reading matches two items', () => {
		const series = [...radio(1), item({ role: 'snr', name: 'Radio 1 noise SNR', key: 'noise[1]', units: 'dB', value: '9' }), ...radio(2)];
		expect(warnings(check({ series }))).toContain('ambiguous_radio');
	});

	it('draws a radio without SNR uncoloured and says so', () => {
		const result = check({ series: [...radio(1, { snr: null }), ...radio(2)] });
		expect(result.ok).toBe(true);
		expect(warnings(result)).toContain('no_snr');
	});

	it('hides switched-off bands, and explains an empty map', () => {
		const series = [...radio(1, { band: '2.4' }), ...radio(2, { band: '5' })];
		const { aps } = wirelessModel(payload('wifi_floor', { config: { ...CONFIG, show_band_24: false }, hosts: [ap()], series, floor: FLOOR }));
		expect(aps[0].radios.map((entry) => entry.band)).toEqual(['5']);
		const result = check({ config: { show_band_5: false }, series: radio(1) });
		expect(errors(result)).toContain('no_radios');
		expect(result.errors[0].message).toContain('switched off');
	});

	it('reports items without a radio identity', () => {
		const series = [...radio(1), item({ role: 'snr', name: 'Overall SNR', key: 'snr', units: 'dB', value: '20' })];
		expect(warnings(check({ series }))).toContain('no_radio_identity');
	});

	it('reports SNR thresholds that do not resolve', () => {
		expect(errors(check({ config: { snr_thresholds: 'low, high' } }))).toContain('invalid_thresholds');
	});
});

describe('C34 rogue APs', () => {
	const rogue = (value, name = 'Rogue APs') => item({ role: 'rogue', name, key: `rogue[${name}]`, units: '', value_type: 3, value });
	const model = (config, series) => wirelessModel(payload('wifi_floor', { config: { ...CONFIG, ...config }, hosts: [ap()], series: [...radio(1), ...series], floor: FLOOR }));

	it('reads a count item on the access point', () => {
		expect(model({}, [rogue('3')]).aps[0].rogues).toEqual({ count: 3, names: [] });
	});

	it('counts discovered rogue items when chosen', () => {
		expect(model({ rogue_count: 'items' }, [rogue('1', 'Rogue aa:bb'), rogue('1', 'Rogue cc:dd')]).aps[0].rogues)
			.toEqual({ count: 2, names: ['Rogue aa:bb', 'Rogue cc:dd'] });
	});

	it('shows no badge without rogue items or values', () => {
		expect(model({}, []).aps[0].rogues).toBeNull();
		expect(model({}, [rogue(null)]).aps[0].rogues).toBeNull();
	});
});

describe('C34 estimated coverage', () => {
	const settings = coverageSettings(CONFIG);

	it('uses each channel\'s centre frequency, or the band centre without one', () => {
		expect([channelFrequency('2.4', '1'), channelFrequency('2.4', '14'), channelFrequency('5', '36'), channelFrequency('6', '37')]).toEqual([2412, 2484, 5180, 6135]);
		expect([channelFrequency('2.4', null), channelFrequency('5', 'auto'), channelFrequency('6', '999')]).toEqual([2437, 5500, 6475]);
	});

	it('follows the ITU-R P.1238 indoor path loss', () => {
		// 20·log10(2437) + 28·log10(10) − 28 = 67.74 + 28 − 28.
		expect(pathLoss(2437, 10, 28)).toBeCloseTo(67.74, 1);
		// 18 dBm reaches -67 dBm at the distance where the loss is 85 dB.
		const range = rangeTo(18, -67, 2437, 28);
		expect(pathLoss(2437, range, 28)).toBeCloseTo(85, 6);
		expect(range).toBeGreaterThan(30);
		expect(range).toBeLessThan(45);
		expect(rangeTo(-10, -30, 6000, 31)).toBe(0);
	});

	it('gives 5 and 6 GHz less range than 2.4 GHz at the same power', () => {
		const at = (band, channel) => contours({ band, channel, txPower: 18 }, settings)[0].radius;
		expect(at('2.4', '6')).toBeGreaterThan(at('5', '36'));
		expect(at('5', '36')).toBeGreaterThan(at('6', '37'));
	});

	it('draws one ring per signal level, outermost first, from the edge up', () => {
		const rings = contours({ band: '5', channel: '36', txPower: 20 }, settings);
		expect(rings).toHaveLength(LEVELS);
		expect(rings.map((ring) => ring.level)).toEqual(Array.from({ length: LEVELS }, (_, index) => -67 + index * LEVEL_STEP));
		expect(rings.every((ring, index) => index === 0 || ring.radius < rings[index - 1].radius)).toBe(true);
	});

	it('prefers the radio\'s transmit power item over the entered power, and draws nothing without either', () => {
		const strong = contours({ band: '5', channel: '36', txPower: 20 }, settings)[0].radius;
		const entered = contours({ band: '5', channel: '36', txPower: null }, settings)[0].radius;
		expect(strong).toBeGreaterThan(entered);
		expect(contours({ band: '5', channel: '36', txPower: null }, { ...settings, power: null })).toEqual([]);
	});

	it('needs the plan width, edge level and coefficients', () => {
		expect(errors(check({ config: { plan_width: '' } }))).toContain('invalid_coverage');
		expect(errors(check({ config: { edge_level: '-10' } }))).toContain('invalid_coverage');
		expect(errors(check({ config: { path_loss_n: '28, 31' } }))).toContain('invalid_coverage');
		expect(errors(check({ config: { tx_power_default: '50' } }))).toContain('invalid_coverage');
		expect(errors(check({ config: { coverage_scale: '5' } }))).toContain('invalid_coverage');
		expect(errors(check({ config: { coverage_scale: 'big' } }))).toContain('invalid_coverage');
		expect(check({ config: { ring_size: 'band', plan_width: '' } }).ok).toBe(true);
	});

	it('says which radios have no transmit power', () => {
		const result = check({ config: { tx_power_default: '' } });
		expect(result.ok).toBe(true);
		expect(warnings(result)).toContain('no_tx_power');
		const powered = [...radio(1), item({ role: 'txpower', name: 'Radio 1 power', key: 'txpower[1]', units: 'dBm', value: '17' })];
		expect(warnings(check({ config: { tx_power_default: '' }, series: powered }))).not.toContain('no_tx_power');
	});
});

describe('C34 channel overlap and coverage gaps', () => {
	const settings = coverageSettings(CONFIG);
	const r = (band, channel, width = 20) => ({ band, channel, width });

	it('works out the spectrum each channel and channel width occupies', () => {
		expect(spectrum(r('2.4', '1'))).toEqual([2402, 2422]);
		expect(spectrum(r('2.4', '6', 40))).toEqual([2407, 2467]);
		expect(spectrum(r('5', '36', 80))).toEqual([5170, 5250]);
		expect(spectrum(r('5', '44', 80))).toEqual([5170, 5250]);
		expect(spectrum(r('5', '149', 80))).toEqual([5735, 5815]);
		expect(spectrum(r('5', '100', 160))).toEqual([5490, 5650]);
		expect(spectrum(r('6', '37', 160))).toEqual([6105, 6265]);
		expect(spectrum(r('5', 'auto'))).toBeNull();
	});

	it('flags overlapping channels on the same band only', () => {
		expect(spectrumOverlap(r('2.4', '1'), r('2.4', '3'))).toBe(true);
		expect(spectrumOverlap(r('2.4', '1'), r('2.4', '6'))).toBe(false);
		expect(spectrumOverlap(r('5', '36', 80), r('5', '48'))).toBe(true);
		expect(spectrumOverlap(r('5', '36', 80), r('5', '52'))).toBe(false);
		expect(spectrumOverlap(r('5', '36'), r('6', '37'))).toBe(false);
	});

	it('finds gaps and overlap on a grid over the plan', () => {
		const a = { name: 'a' };
		const b = { name: 'b' };
		const sources = [
			{ ap: a, radio: { ...r('2.4', '1'), txPower: 15 }, x: 10, y: 10 },
			{ ap: b, radio: { ...r('2.4', '3'), txPower: 15 }, x: 30, y: 10 }
		];
		const grid = coverageGrid(sources, settings, 200, 20);
		expect(grid.gaps.length).toBeGreaterThan(0);
		expect(grid.clashes.length).toBeGreaterThan(0);
		// Overlap lies only where both radios reach the edge level.
		const range = contours({ ...r('2.4', '1'), txPower: 15 }, settings)[0].radius;
		const within = (column, row, x) => Math.hypot((column + 0.5) * grid.size - x, (row + 0.5) * grid.size - 10) <= range + grid.size;
		expect(grid.clashes.every(({ column, row }) => within(column, row, 10) && within(column, row, 30))).toBe(true);
		const apart = coverageGrid([sources[0], { ...sources[1], radio: { ...r('2.4', '11'), txPower: 15 } }], settings, 200, 20);
		expect(apart.clashes).toEqual([]);
	});

	it('stretches every range by the coverage scale', () => {
		const doubled = { ...settings, factor: 2 };
		const radio = { ...r('5', '36'), txPower: 15 };
		const plain = contours(radio, settings);
		const scaled = contours(radio, doubled);
		expect(scaled.map((ring) => ring.radius)).toEqual(plain.map((ring) => ring.radius * 2));
		const lone = [{ ap: { name: 'a' }, radio, x: 5, y: 5 }];
		expect(coverageGrid(lone, doubled, 200, 20).gaps.length).toBeLessThan(coverageGrid(lone, settings, 200, 20).gaps.length);
		expect(coverageSettings({ ...CONFIG, coverage_scale: '200' }).factor).toBe(2);
		expect(coverageSettings({ ...CONFIG, coverage_scale: '' }).factor).toBe(1);
	});

	it('leaves cells outside the building unshaded', () => {
		const lone = [{ ap: { name: 'a' }, radio: { ...r('5', '36'), txPower: 15 }, x: 5, y: 5 }];
		const all = coverageGrid(lone, settings, 200, 20);
		const shape = gridShape(200, 20);
		expect([shape.columns, shape.rows]).toEqual([all.columns, all.rows]);
		// Only the left half of the plan is indoors.
		const half = coverageGrid(lone, settings, 200, 20, (column) => column < shape.columns / 2);
		expect(half.gaps.length).toBeGreaterThan(0);
		expect(half.gaps.length).toBeLessThan(all.gaps.length);
		expect(half.gaps.every(({ column }) => column < shape.columns / 2)).toBe(true);
	});

	it('estimates nothing without a transmit power', () => {
		const grid = coverageGrid([{ ap: {}, radio: { ...r('5', '36'), txPower: null }, x: 1, y: 1 }], { ...settings, power: null }, 50, 20);
		expect(grid.gaps).toEqual([]);
		expect(grid.clashes).toEqual([]);
	});
});
