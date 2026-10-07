/**
 * C14 LLD Data Table: discovered items as rows and columns of an HTML table,
 * with sorting, filtering and paging in the browser. The server never sends
 * more than its item limit (see DataProvider::MAX_ITEMS), and the table shows
 * at most one page of rows at a time.
 *
 * Rows come from data/table.js. Sorting, filter text, page and page size are
 * kept in context.state, so they survive the widget's refreshes.
 */
import { buildTable, cellView, DEFAULT_PAGE_SIZE, PAGE_SIZES, pageRows } from '../data/table.js';
import { formatClock } from './common.js';
import { applyThemeVariables } from '../ui/theme.js';
import { el, replaceKeepingFocus } from '../utils/dom.js';

function severityName(severities, severity) {
	return severities[severity]?.name || `Severity ${severity}`;
}

/** The columns the table shows, in order, each with how to display and sort it. */
export function tableLayout(payload, context) {
	const { config } = payload;
	const table = buildTable(payload);
	const options = { useValuemap: config.use_valuemap !== false, decimals: context.decimals, showChange: config.show_change === true };
	const views = new Map(table.rows.map((row) => [row.key, row.cells.map((cell) => cellView(cell, options))]));
	const columns = [];

	if (config.show_host !== false) {
		columns.push({ id: 'host', heading: 'Host', text: (row) => row.host, sort: (row) => row.host });
	}
	if (config.row_identity !== 'item' || config.show_item_name !== false) {
		columns.push({ id: 'row', heading: table.rowHeading, text: (row) => row.label, sort: (row) => row.label });
	}
	table.columns.forEach((column, index) => {
		columns.push({
			id: `value:${index}`,
			heading: column.heading,
			value: true,
			cell: (row) => views.get(row.key)[index],
			text: (row) => views.get(row.key)[index].text,
			sort: (row) => views.get(row.key)[index].sort
		});
	});
	if (config.show_last_update !== false) {
		columns.push({
			id: 'updated',
			heading: 'Last update',
			text: (row) => (row.updated === null ? '' : formatClock(row.updated, context.timeZone, { seconds: true })),
			sort: (row) => row.updated
		});
	}
	if (config.show_problems === true) {
		columns.push({
			id: 'problems',
			heading: 'Problems',
			problems: true,
			text: (row) => (row.severity === null ? 'OK' : severityName(payload.severities, row.severity)),
			sort: (row) => (row.severity === null ? -1 : row.severity * 10000 + row.problems.length)
		});
	}

	return { table, columns };
}

function headerCell(column, state, redraw) {
	const sorted = state.sort?.column === column.id ? state.sort.direction : null;
	const button = el('button', {
		className: 'zw-table-sort',
		text: column.heading,
		attrs: { type: 'button', 'data-zw-focus': `sort:${column.id}` },
		on: {
			click: () => {
				state.sort = { column: column.id, direction: sorted === 'asc' ? 'desc' : 'asc' };
				state.page = 1;
				redraw();
			}
		}
	}, [sorted === null ? null : el('span', { className: 'zw-table-sort-mark', text: sorted === 'asc' ? ' ▲' : ' ▼', attrs: { 'aria-hidden': 'true' } })]);
	return el('th', {
		className: column.value ? 'zw-table-number' : '',
		attrs: { scope: 'col', 'aria-sort': sorted === null ? 'none' : sorted === 'asc' ? 'ascending' : 'descending' }
	}, [button]);
}

function bodyCell(column, row, payload) {
	if (column.value) {
		const view = column.cell(row);
		return el('td', { className: `zw-table-number${view.missing ? ' zw-table-missing' : ''}`, title: view.title }, [
			el('span', { text: view.text }),
			view.change === null ? null : el('span', {
				className: `zw-table-change ${view.change.delta > 0 ? 'zw-table-up' : view.change.delta < 0 ? 'zw-table-down' : ''}`,
				text: ` ${view.change.text}`,
				title: 'Change since the previous value'
			})
		]);
	}
	if (column.problems) {
		if (row.severity === null) {
			return el('td', { className: 'zw-table-ok', text: 'OK' });
		}
		const colour = payload.severities[row.severity]?.color;
		return el('td', { title: row.problems.map((problem) => problem.name).join('\n') }, [
			el('span', { className: 'zw-table-severity', text: column.text(row), style: colour ? { 'background-color': colour } : {} }),
			row.problems.length > 1 ? el('span', { className: 'zw-table-count', text: ` ×${row.problems.length}` }) : null
		]);
	}
	return el('td', { text: column.text(row), title: column.text(row) });
}

function footer(view, state, redraw) {
	const select = el('select', {
		attrs: { 'aria-label': 'Rows per page', 'data-zw-focus': 'page-size' },
		on: {
			change: (event) => {
				state.pageSize = Number(event.target.value);
				state.page = 1;
				redraw();
			}
		}
	}, PAGE_SIZES.map((size) => el('option', { text: size, attrs: { value: size, selected: size === view.pageSize } })));
	const move = (delta, label, disabled) => el('button', {
		className: 'zw-table-page',
		text: label,
		attrs: { type: 'button', disabled, 'aria-label': delta < 0 ? 'Previous page' : 'Next page', 'data-zw-focus': `page:${delta}` },
		on: { click: () => { state.page = view.page + delta; redraw(); } }
	});
	return el('div', { className: 'zw-table-footer' }, [
		el('label', { className: 'zw-table-size' }, [el('span', { text: 'Rows per page ' }), select]),
		el('span', { className: 'zw-table-range', text: view.total === 0 ? '0 rows' : `${view.first}–${view.last} of ${view.total}` }),
		move(-1, '‹', view.page <= 1),
		move(1, '›', view.page >= view.pages)
	]);
}

export function renderTable(container, payload, context) {
	const { config } = payload;
	const state = context.state ?? {};
	state.pageSize ??= Number(config.table_page_size) || DEFAULT_PAGE_SIZE;
	state.search ??= '';
	state.page ??= 1;

	const { table, columns } = tableLayout(payload, context);
	if (state.sort && !columns.some((column) => column.id === state.sort.column)) {
		state.sort = null;
	}
	const byId = new Map(columns.map((column) => [column.id, column]));
	const searchable = (row) => columns.map((column) => column.text(row)).join('\u0000');

	const draw = () => {
		const view = pageRows(table.rows, {
			search: state.search,
			sort: state.sort ?? null,
			page: state.page,
			pageSize: state.pageSize,
			sortValue: (row, id) => byId.get(id).sort(row),
			text: searchable
		});
		state.page = view.page;

		const root = el('div', {
			className: ['zw-table', config.table_dense ? 'zw-table-dense' : '', config.table_striped !== false ? 'zw-table-striped' : ''].join(' ').trim()
		}, [
			el('div', { className: 'zw-table-toolbar' }, [
				el('input', {
					className: 'zw-table-search',
					attrs: { type: 'search', placeholder: 'Filter rows', 'aria-label': 'Filter rows', value: state.search, 'data-zw-focus': 'search' },
					on: {
						input: (event) => {
							state.search = event.target.value;
							state.page = 1;
							redraw();
						}
					}
				})
			]),
			el('div', { className: 'zw-table-scroll' }, [
				el('table', { className: 'zw-table-grid' }, [
					el('thead', {}, [el('tr', {}, columns.map((column) => headerCell(column, state, redraw)))]),
					el('tbody', {}, view.rows.length === 0
						? [el('tr', {}, [el('td', { className: 'zw-table-empty', text: 'No rows match the filter.', attrs: { colspan: columns.length } })])]
						: view.rows.map((row) => el('tr', {}, columns.map((column) => bodyCell(column, row, payload)))))
				])
			]),
			footer(view, state, redraw)
		]);
		applyThemeVariables(root, context.theme);
		return root;
	};

	function redraw() {
		replaceKeepingFocus(container, draw);
		const search = container.querySelector('.zw-table-search');
		if (search !== null && search.value !== state.search) {
			search.value = state.search;
		}
	}

	redraw();
}

export default {
	id: 'lld_table',
	kind: 'dom',
	render: renderTable
};
