/**
 * Renderer lookup. Each chart id in the registry maps to one renderer module.
 * Charts whose renderer has not been written yet are reported as unavailable
 * rather than drawn with a stand-in.
 */
import column from './column.js';

const RENDERERS = new Map([column].map((renderer) => [renderer.id, renderer]));

export function getRenderer(id) {
	return RENDERERS.get(id) ?? null;
}
