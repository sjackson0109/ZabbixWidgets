<?php declare(strict_types = 0);
/*
 * ZabbixWidgets Extended Charts
 * Copyright (c) ZabbixWidgets contributors. Licensed under the MIT licence; see LICENSE.
 */

namespace Modules\ZabbixWidgetsCharts\Includes;

use RuntimeException;

/**
 * PHP view of registry/charts.json, the same file the browser bundle uses.
 * The action asks it which data a chart needs so nothing is fetched "just in case".
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
	 * Labels for a stored enum field, keyed by stored integer.
	 */
	public static function enumValues(string $field): array {
		$values = self::definitions()['enums'][$field] ?? [];

		return array_values(array_filter($values, 'is_string'));
	}

	/**
	 * Converts stored integers of enum fields into their string values.
	 */
	public static function enumValue(string $field, $stored): ?string {
		$values = self::enumValues($field);

		return $values[(int) $stored] ?? null;
	}

	/**
	 * Mirrors evaluateCondition() in src/registry/index.js.
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
