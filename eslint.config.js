import js from '@eslint/js';
import globals from 'globals';

export default [
	{
		ignores: ['node_modules/', 'dist/', 'coverage/', 'modules/extended-charts/assets/js/zabbixwidgets-charts.js']
	},
	js.configs.recommended,
	{
		languageOptions: {
			ecmaVersion: 2023,
			sourceType: 'module',
			globals: { ...globals.browser }
		},
		rules: {
			// Spec section 16: no dynamic code execution.
			'no-eval': 'error',
			'no-implied-eval': 'error',
			'no-new-func': 'error',
			'no-restricted-properties': ['error',
				{ property: 'innerHTML', message: 'Build DOM nodes or escape with escapeHtml().' },
				{ property: 'outerHTML', message: 'Build DOM nodes or escape with escapeHtml().' }
			],
			'no-restricted-syntax': ['error',
				{ selector: "CallExpression[callee.property.name='insertAdjacentHTML']", message: 'Build DOM nodes instead.' },
				{ selector: "CallExpression[callee.object.name='document'][callee.property.name=/^(querySelector|querySelectorAll|getElementById|getElementsByClassName)$/]", message: 'Scope DOM lookups to the widget, not the whole page.' }
			],
			'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
			eqeqeq: ['error', 'always', { null: 'ignore' }],
			'prefer-const': 'error'
		}
	},
	{
		files: ['src/ui/edit-form.js'],
		rules: {
			// The edit form lives in Zabbix's dialog; its root element is found by id once.
			'no-restricted-syntax': 'off'
		}
	},
	{
		files: ['scripts/**', 'tests/**', '*.config.js'],
		languageOptions: { globals: { ...globals.node } },
		rules: { 'no-restricted-properties': 'off', 'no-restricted-syntax': 'off' }
	}
];
