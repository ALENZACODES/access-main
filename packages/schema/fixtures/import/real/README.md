# Real import fixtures

These five JSON files are unmodified records from `ALENZACODES/access-maps` pull request 1, branch `cursor/ontario-open-data-pipeline-986f`, retrieved 2026-11-13.

They are open-data imports. `UNKNOWN` means the source did not state the fact. Nothing in these files is an App verification. `wheelchair` and `wheelchair_boarding` values are source tags or operator fields, tier 0 or tier 1.

| File | Record | Licence on the record |
| --- | --- | --- |
| `venue.osm-node-238726675.json` | OSM node 238726675 | ODbL-1.0, © OpenStreetMap contributors |
| `washroom.osm-node-5747441521.json` | OSM node 5747441521 | ODbL-1.0, © OpenStreetMap contributors |
| `path.osm-way-333112785.json` | OSM way 333112785 | ODbL-1.0, © OpenStreetMap contributors |
| `transit.gtfs-go-08047.json` | GO Transit stop 08047 | `OGL-Ontario-Metrolinx-1.0`, the licence id stored by the importer |
| `source.osm-ontario.json` | Geofabrik Ontario extract registry row | ODbL-1.0 |

ODbL share-alike applies to the OSM rows. The registry row in this folder does not yet carry `share_alike: true`; `odblShareAlikeMissing` reports that gap. Do not treat that omission as permission to mix the rows into a non-ODbL database.
