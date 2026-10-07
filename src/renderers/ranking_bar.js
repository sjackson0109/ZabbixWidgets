/**
 * C17 Horizontal Ranking Bar: entities ranked by their current value, top
 * to bottom. Top N keeps the N highest values and Bottom N the N lowest;
 * the order setting decides which end is drawn first. Equal values keep a
 * stable order (by label, then id). Optional thresholds colour each bar by
 * its band and are marked on the axis.
 */
import { baseOption, valueAxis } from './common.js';
import { chartEntities, sortEntities } from '../data/groups.js';
import { bandColours, bandIndex, sharedScale } from '../data/thresholds.js';
import { formatValue } from '../data/units.js';
import { escapeHtml } from '../utils/escape.js';

export function rankedEntities(payload) {
	const { config } = payload;
	const series = payload.series.filter((entry) => entry.role === 'value');
	const entities = chartEntities(series, config.entity_by === 'host' ? 'host' : 'item');
	const count = Math.max(1, Number(config.rank_count) || 10);
	const order = config.rank_order === 'asc' ? 'asc' : 'desc';
	let chosen = entities;
	if (config.rank_limit === 'top') {
		chosen = sortEntities(entities, 'desc').slice(0, count);
	}
	else if (config.rank_limit === 'bottom') {
		chosen = sortEntities(entities, 'asc').slice(0, count);
	}
	return { ranked: sortEntities(chosen, order), total: entities.length };
}

export function buildRankingBarOption(payload, context) {
	const { config } = payload;
	const { ranked } = rankedEntities(payload);
	const units = ranked[0]?.units ?? '';
	const { scale } = sharedScale({ thresholds: config.thresholds }, payload.hosts);
	const thresholds = scale.thresholds;
	const colours = bandColours(thresholds.length + 1, config.threshold_order);
	const format = (value) => formatValue(value, units, context.decimals);

	const base = baseOption(context);

	return {
		...base,
		legend: { show: false },
		grid: { left: 8, right: config.show_value !== false ? 72 : 16, top: 8, bottom: 8, containLabel: true },
		xAxis: { ...valueAxis(context, units), splitNumber: 4 },
		yAxis: {
			type: 'category',
			inverse: true,
			data: ranked.map((entity) => entity.label),
			axisLine: { lineStyle: { color: context.theme.axisLine } },
			axisTick: { show: false },
			axisLabel: { color: context.theme.text, interval: 0, overflow: 'truncate', width: 180 }
		},
		tooltip: {
			...base.tooltip,
			trigger: 'item',
			formatter: (param) => {
				const entity = ranked[param.dataIndex];
				const detail = entity.items.length > 1 ? `<br>${escapeHtml(`sum of ${entity.items.length} items`)}` : '';
				return `<b>#${param.dataIndex + 1} ${escapeHtml(entity.label)}</b><br>${escapeHtml(format(entity.value))}${detail}`;
			}
		},
		series: [{
			type: 'bar',
			barMaxWidth: 22,
			barCategoryGap: '35%',
			showBackground: config.show_track !== false,
			backgroundStyle: { color: context.theme.splitLine },
			label: {
				show: config.show_value !== false,
				position: 'right',
				color: context.theme.text,
				formatter: (param) => format(ranked[param.dataIndex].value)
			},
			data: ranked.map((entity) => ({
				value: entity.value,
				itemStyle: thresholds.length > 0 ? { color: colours[bandIndex(entity.value, thresholds)] } : undefined
			})),
			markLine: thresholds.length === 0 ? undefined : {
				silent: true,
				symbol: 'none',
				lineStyle: { color: context.theme.mutedText, type: 'dashed' },
				label: { position: 'insideEndTop', color: context.theme.mutedText, formatter: (param) => format(param.value) },
				data: thresholds.map((value) => ({ xAxis: value }))
			}
		}]
	};
}

export default {
	id: 'ranking_bar',
	buildOption: buildRankingBarOption
};
