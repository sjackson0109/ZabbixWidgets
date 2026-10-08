# Map files for the Geographic Site Map

The Geographic Site Map (C32) draws hosts at the latitude and longitude in
their host inventory. By default it draws them over the world land outline
bundled with the module. To draw them over a map of your own, such as a
country, a campus or a region, put a GeoJSON file in this folder and choose
**Base map: Map file** in the widget.

- The file must be a GeoJSON `FeatureCollection` with coordinates in
  longitude and latitude (WGS 84), as most GIS tools export by default.
- Name it with letters, digits, `-` or `_`, ending in `.geojson` (or
  `.json`), for example `sites.geojson`. In the widget, enter the name with or
  without the extension: `sites`.
- It can be at most 2 MB. Simplify large files first (for example with
  mapshaper), since every refresh sends the map to the browser.
- Files are read only from this folder. Folders, paths and web addresses are
  refused, and nothing is fetched from a map service.

Files you add here are not part of the module. Copy them again after
replacing the module folder during an upgrade.
