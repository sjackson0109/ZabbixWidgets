# Wireless Airspace Heat-Map: template requirements

What a Zabbix template (and the hosts it is linked to) must provide for every part of the C34 Wireless Airspace Heat-Map to work. Any template works, whether SNMP, HTTP agent or a script, as long as its items follow these rules. The widget never needs a particular key name: you point each widget field at your items with name patterns.

## At a glance

| Object | Where | Required | Used for |
|---|---|---|---|
| One host per access point | Host | Yes | Each host is one point on the plan |
| `{$WIFI.MAP.X}`, `{$WIFI.MAP.Y}` | Macros on the host itself | Yes, unless you use the widget's positions list | Position on the plan |
| A tag such as `floor` | Host tags | No | Choosing one floor's access points |
| Band item, per radio | Item or item prototype | Yes | Which band the radio is on |
| Channel item, per radio | Item or item prototype | Yes | Channel label, frequency, overlap |
| Channel width item, per radio | Item or item prototype | No (20 MHz assumed) | Overlap |
| SNR item, per radio | Item or item prototype | No (grey without it) | Colour |
| Transmit power item, per radio | Item or item prototype | No, but needed for estimated coverage unless you enter a default power | Ring size, gaps, overlap |
| Client count item(s) | Item or item prototypes | No | Blue client badge |
| Rogue AP item(s) | Item or item prototypes | No | Orange rogue badge |
| Radio identity | Key parameter, item tag or item name | Yes | Grouping a radio's items together |
| Floor plan | Administration > General > Images, type Background | Yes | The picture under the map |

## 1. Hosts

- **One host per access point.** A radio's items must all be on the access point's own host. APs that exist only as discovered entities on a controller host are not supported.
- **Position macros on the host itself.** Set `{$WIFI.MAP.X}` (0 to 100, percent across the image from the left) and `{$WIFI.MAP.Y}` (0 to 100, percent down from the top) on each AP host. Values inherited from a template or set globally are ignored, because they would put every AP on the same spot. Decimals are allowed (`22.5`). The macro names can be changed in the widget.
  - Templates may declare these macros with an empty value so they appear on every host for you to fill in. An empty value counts as "no position" and that AP is listed in a warning.
  - Instead of macros you can type positions into the widget (`host name = across, down`, one per line).
- **Host tags (optional).** With a tag such as `floor` = `0`, the widget's **Host tags** field (`floor=0`) keeps one widget per floor plan. The tag must be set on the host itself: a tag that exists only on a linked template is not matched.
- The dashboard user needs read permission on the hosts. Up to 1000 hosts per widget.

### Worked example: Chelsea Harbour, ground floor

The ground-floor plan is 300 m wide and 175 m deep (792 × 462 pixels as drawn, 1584 × 924 in the transparent copy; percentages are the same in both). On this plan:

- 1 % across is 3 m, and 1 % down is 1.75 m. So 1 m is 0.33 % across or 0.57 % down.
- A 9 m spacing between access points is 3 % across or 5.1 % down.
- The building fills X 0.4 to 85.2 % and Y 9.5 to 92.6 %. Any value outside that puts the access point outdoors, and the rest of the image (the river side to the east and south) is empty.

| Area | `{$WIFI.MAP.X}` | `{$WIFI.MAP.Y}` | Notes |
|---|---|---|---|
| West wing | 0.4 to 16.5 | 9.5 to 26.8 | |
| Domes building (north) | 16.5 to 80.8 | 9.5 to 53.0 | Shops around the three hex areas |
| West dome hex | 24 to 35 | 21.6 to 41 | Glass dome and mezzanine void: no access points inside |
| Centre dome hex | 43 to 54 | 23 to 42 | As above |
| East dome hex | 63 to 74 | 21.6 to 41 | As above |
| Avenue | 14.1 to 83.3 | 53.0 to 66.7 | Access points only under the arches, not in the middle |
| Avenue, north arches | 20 to 80 | 53 to 55 | Along the shopfronts of the domes building |
| Avenue, south arches | 30 to 83 | 65 to 67.5 | Along the Chambers colonnade |
| The Chambers (south) | 30.6 to 85.2 | 66.7 to 92.6 | Design studios and shops |

The 16 access points drawn in the demo renders were placed by these rules (positions chosen for the demo, not surveyed):

| Host | Where | X | Y |
|---|---|---|---|
| ch-gf-ap01 | West wing shop | 7.6 | 18.4 |
| ch-gf-ap02 | West dome, north shop edge | 27.1 | 19.9 |
| ch-gf-ap03 | West dome, south shop edge | 33.5 | 42.2 |
| ch-gf-ap04 | Centre dome, north shop edge | 51.8 | 20.6 |
| ch-gf-ap05 | Centre dome, south shop edge | 45.5 | 43.3 |
| ch-gf-ap06 | East dome, north shop edge | 65.0 | 19.9 |
| ch-gf-ap07 | East dome, south shop edge | 72.0 | 42.2 |
| ch-gf-ap08 | Domes building, east entrance | 78.9 | 41.1 |
| ch-gf-ap09 | Avenue, north arches west | 31.6 | 53.7 |
| ch-gf-ap10 | Avenue, north arches east | 56.8 | 53.7 |
| ch-gf-ap11 | Avenue, south arches west | 44.2 | 66.0 |
| ch-gf-ap12 | Avenue, south arches east | 69.4 | 66.0 |
| ch-gf-ap13 | Avenue and Chambers, east entrance | 77.7 | 62.8 |
| ch-gf-ap14 | Chambers west | 37.9 | 79.0 |
| ch-gf-ap15 | Chambers centre | 59.3 | 79.0 |
| ch-gf-ap16 | Chambers east | 75.8 | 79.0 |

To find a real access point's values, measure its pixel position on the plan in any image editor and divide: X = pixel across ÷ image width × 100, Y = pixel down ÷ image height × 100. In the widget, set **Floor plan width (m)** to `300` for this plan.

## 2. Radio items

Each radio is a set of items on the AP host: one band item, one channel item, and optionally one each of width, SNR and transmit power. A tri-band AP therefore has three sets. Low-level discovery (one item prototype per role, discovered once per radio) is the natural way to build them.

| Role | Value type | Accepted values | Units |
|---|---|---|---|
| **Band** | Numeric or character/text | GHz (`2.4`, `5`, `6`), MHz (`2412`, `5180`, `5955`), or text naming the band (`5 GHz`, `6E`, `2.4GHz`), either as the value itself or as its value mapping. A code such as `1` / `2` / `3` works only with a value mapping that turns it into text naming the band. | Any |
| **Channel** | Numeric (unsigned) preferred, or text | The 802.11 channel number: 1 to 14 on 2.4 GHz, 32 to 177 on 5 GHz, 1 to 233 on 6 GHz. Text such as `36` works. `36E` or `36+` is shown as written, but the band's centre frequency is used for its range and it is left out of overlap. | None |
| **Channel width** | Numeric or text | 20, 40, 80, 160 or 320, or text containing one of them (`VHT80`, `HE160`, `80 MHz`), directly or through a value mapping. | MHz |
| **SNR** | Numeric (float or unsigned) | Signal-to-noise ratio in dB. | `dB` |
| **Transmit power** | Numeric (float or unsigned) | The radio's transmit power in dBm, EIRP if the template has it (antenna gain included). | `dBm` |

Rules that apply to all of them:

- **The band never comes from the channel number.** 6 GHz channel numbers repeat 2.4 and 5 GHz ones, so a radio whose band item has no value, or a value that names no band, is left out and listed in a warning.
- **Latest value only.** The widget reads each item's most recent value within the global history period (Administration > General > GUI, 24 hours by default). Items must store history (not "Do not store"), be enabled and be on monitored hosts.
- **One item per role per radio.** Two band items with the same radio identity on one host make that radio ambiguous; it is left out and listed.
- Up to 500 items per widget field.

### Radio identity (how a radio's items are grouped)

Choose one in **Radios from**:

1. **Key parameter** (default). The first key parameter is the radio. Every role's key must carry the same first parameter for the same radio:
   `wlan.radio.band[{#RADIO}]`, `wlan.radio.channel[{#RADIO}]`, `wlan.radio.width[{#RADIO}]`, `wlan.radio.snr[{#RADIO}]`, `wlan.radio.txpower[{#RADIO}]`.
   SNMP item keys are free text in Zabbix, so an SNMP template can use this form too: the OID goes in the item's SNMP OID field, not in the key.
2. **Item tag.** Every radio item carries a tag with the same value per radio, for example `radio` = `{#RADIO}`. Enter the tag name in **Radio tag**.
3. **Regular expression.** A capture group in the item name gives the radio, for example `Radio (\d+) ` on names such as `Radio 1 SNR`.

### Item names and widget patterns

Each widget field selects items by a name pattern with `*` wildcards, and a pattern matches **anywhere** in the name. Make every role's name distinct:

| Role | Example name | Widget pattern |
|---|---|---|
| Band | `Radio {#RADIO} band` | `Radio * band` |
| Channel | `Radio {#RADIO} channel` | `Radio * channel` |
| Channel width | `Radio {#RADIO} width` | `Radio * width` |
| SNR | `Radio {#RADIO} SNR` | `Radio * SNR` |
| Transmit power | `Radio {#RADIO} transmit power` | `Radio * transmit power` |

Avoid names where one role's name contains another's: with `Radio 1 channel width`, the pattern `Radio * channel` would select the width items as channel items too. Name the width item `Radio 1 width`, or use `Radio * channel` only if no other radio item name contains "channel".

## 3. Client count (optional)

One numeric item per AP host whose value is the number of clients associated with that AP, such as `Associated clients`. Several matching items on one host (for example one per radio or per SSID) are added together, so point the field at either the per-AP total or the per-radio counts, not both. It is drawn as a blue badge on the AP, to the left of the rogue badge, and shown in the tooltip.

## 4. Rogue APs (optional)

Two forms are supported, chosen in **Rogue APs**:

- **Item value is the count.** One numeric item per AP host, such as `Rogue APs detected`, whose value is the number of rogue APs that AP sees. Several matching items on one host are added together.
- **Count matching items.** One discovered item per rogue on the AP host that detects it, such as `Rogue AP {#BSSID} signal`. The badge counts the matching items that have a value in the history period, and the tooltip lists their names. The values themselves are not used.

Rogues reported only on a controller host, with no item on the detecting AP's own host, cannot be shown. Rogue APs are never drawn at a position of their own, because Zabbix does not know where they are.

## 5. Floor plan

- Upload the plan in **Administration > General > Images** with the type **Background** (PNG, JPEG or GIF). Images are readable by all users.
- For estimated coverage, enter the plan's real width in metres in the widget.
- Make everything outside the building, and any open voids (atriums), **transparent** in a PNG. Those areas are then never shaded as coverage gaps or overlap.

## 6. Example: one radio from discovery

A discovery rule returning `{#RADIO}` = `1`, `2`, `3` with these item prototypes gives each AP three complete radios:

| Name | Key | Type of information | Units | Value mapping |
|---|---|---|---|---|
| `Radio {#RADIO} band` | `wlan.radio.band[{#RADIO}]` | Numeric (float) | `GHz` | (none needed when the value is 2.4, 5 or 6) |
| `Radio {#RADIO} channel` | `wlan.radio.channel[{#RADIO}]` | Numeric (unsigned) | | |
| `Radio {#RADIO} width` | `wlan.radio.width[{#RADIO}]` | Numeric (unsigned) | `MHz` | |
| `Radio {#RADIO} SNR` | `wlan.radio.snr[{#RADIO}]` | Numeric (float) | `dB` | |
| `Radio {#RADIO} transmit power` | `wlan.radio.txpower[{#RADIO}]` | Numeric (float) | `dBm` | |

Plus, on the host or template: `Associated clients` (`wlan.clients.count`, Numeric (unsigned)), `Rogue APs detected` (`wlan.rogue.count`, Numeric (unsigned)), the macros `{$WIFI.MAP.X}` and `{$WIFI.MAP.Y}` (empty on the template, set on each host), and a host tag such as `floor`.

When a device reports the band as a code (for example `1` = 2.4 GHz, `2` = 5 GHz, `3` = 6 GHz), keep the item numeric and add a value mapping `1 → 2.4 GHz`, `2 → 5 GHz`, `3 → 6 GHz`. The width works the same way (`3 → 80 MHz`).

## What happens when something is missing

| Missing | Result |
|---|---|
| Position on a host | That AP is not drawn; listed in a warning |
| Band value, or a band that names no band | That radio is not drawn; listed |
| Channel value | Radio drawn, channel shown as "no data", left out of overlap |
| Channel width | 20 MHz assumed for overlap |
| SNR value | Radio drawn in grey |
| Transmit power, with no default power entered | Radio drawn as a small band ring, left out of coverage, gaps and overlap |
| Radio identity (no key parameter, tag or regex match) | Item left out; listed |
| No radio on any placed AP | Error explaining why |
