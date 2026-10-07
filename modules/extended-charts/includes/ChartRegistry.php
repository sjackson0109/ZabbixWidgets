<?php declare(strict_types = 0);
/*
 * ZabbixWidgets Extended Charts
 * Copyright (c) ZabbixWidgets contributors. Licensed under the MIT licence; see LICENSE.
 */

namespace Modules\ZabbixWidgetsCharts\Includes;

use RuntimeException;

/**
 * PHP view of registry/charts.json, the same file the browser bundle uses.
 * The action asks it which data a chart needs so nothing is fetched "just in case",
 * and the form asks it which settings are shown and required.
 *
 * Mirrors src/registry/index.js; tests/compat/registry-parity.test.js keeps them equal.
 */
class ChartRegistry {

	private static ?array $definitions = null;

	public static function definitions(): array {
		if (self::$definitions === null) {
			$json = file_get_contents(__DIR__.'/../registry/charts.json');

			if ($json === false) {
				throw new RuntimeException('Chart registry is missing.');
			}

			self::$definitions = json_decode($json, true, 64, JSON_THROW_ON_ERROR);
		}

		return self::$definitions;
	}

	public static function charts(): array {
		return self::definitions()['charts'];
	}

	public static function byFormValue(int $form_value): ?array {
		foreach (self::charts() as $chart) {
			if ($chart['form_value'] === $form_value) {
				return $chart;
			}
		}

		return null;
	}

	/**
	 * Chart type options for the edit form, keyed by stored integer.
	 */
	public static function formOptions(): array {
		$options = [];

		foreach (self::charts() as $chart) {
			$options[$chart['form_value']] = $chart['name'];
		}

		return $options;
	}

	/**
	 * Item pattern fields, one per data role, keyed by field name, with their labels.
	 */
	public static function itemFields(): array {
		return self::definitions()['item_fields'];
	}

	/**
	 * Radio and select fields, keyed by field name, with their values in stored order.
	 */
	public static function enums(): array {
		return self::definitions()['enums'];
	}

	/**
	 * Converts the stored integer of an enum field into its string value.
	 */
	public static function enumValue(string $field, $stored): ?string {
		return self::enums()[$field][(int) $stored] ?? null;
	}

	/**
	 * Conditions are booleans, "always"/"none", or "when:<field>=<value>[|<value>...]",
	 * which is true when the configured field matches one of the listed values.
	 */
	public static function evaluate($condition, array $config): bool {
		if ($condition === true || $condition === 'always') {
			return true;
		}

		if ($condition === false || $condition === 'none' || $condition === null) {
			return false;
		}

		if (is_string($condition) && strpos($condition, 'when:') === 0) {
			[$field, $values] = explode('=', substr($condition, 5), 2);

			return in_array((string) ($config[$field] ?? ''), explode('|', $values), true);
		}

		throw new RuntimeException('Unknown registry condition: '.json_encode($condition));
	}

	/**
	 * Roles that apply under the current configuration, keyed by role name.
	 */
	public static function activeRoles(array $chart, array $config): array {
		return array_filter($chart['roles'], static function (array $role) use ($config): bool {
			return !is_string($role['required']) || self::evaluate($role['required'], $config);
		});
	}

	/**
	 * Controls the edit form shows: a role's item field only while the role
	 * applies, other controls only while their control condition holds.
	 */
	public static function visibleControls(array $chart, array $config): array {
		$active = self::activeRoles($chart, $config);
		$conditions = array_merge(
			self::definitions()['control_conditions'],
			$chart['control_conditions'] ?? [],
			['time_period' => $chart['time_period']]
		);

		$fields = array_filter($chart['controls'], static function (string $field) use ($chart, $active, $conditions,
				$config): bool {
			$roles = array_filter($chart['roles'], static function (array $role) use ($field): bool {
				return $role['field'] === $field;
			});

			if ($roles) {
				return (bool) array_intersect_key($roles, $active);
			}

			return !array_key_exists($field, $conditions) || self::evaluate($conditions[$field], $config);
		});

		return array_merge(self::definitions()['common_controls'], array_values($fields));
	}

	/**
	 * Shown controls that must not be left empty.
	 */
	public static function requiredControls(array $chart, array $config): array {
		return array_values(
			array_intersect(self::definitions()['required_controls'], self::visibleControls($chart, $config))
		);
	}

	public static function needs(array $chart, string $data): bool {
		return in_array($data, $chart['data'], true);
	}

	public static function requiresHistory(array $chart, array $config): bool {
		return self::evaluate($chart['history'], $config);
	}

	public static function requiresTimePeriod(array $chart, array $config): bool {
		return self::evaluate($chart['time_period'], $config);
	}
}
