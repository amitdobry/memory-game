# QR codes for the six leaflet designs

Generated 19 September 2026 for the first print run. Each code encodes a canonical referral
URL of the landing page; the legacy `?b=N` alias resolves to the same batch on the server.
All six were decoded back from the PNGs after generation and matched their URL exactly.

| File | Batch | Alias | Encoded URL |
|---|---|---|---|
| `qr-LEAF1-b1.{png,svg}` | LEAF1 | b=1 | https://amitdobry.github.io/workshop/?ref=LEAF1 |
| `qr-LEAF2-b2.{png,svg}` | LEAF2 | b=2 | https://amitdobry.github.io/workshop/?ref=LEAF2 |
| `qr-LEAF3-b3.{png,svg}` | LEAF3 | b=3 | https://amitdobry.github.io/workshop/?ref=LEAF3 |
| `qr-LEAF4-b4.{png,svg}` | LEAF4 | b=4 | https://amitdobry.github.io/workshop/?ref=LEAF4 |
| `qr-LEAF5-b5.{png,svg}` | LEAF5 | b=5 | https://amitdobry.github.io/workshop/?ref=LEAF5 |
| `qr-LEAF6-b6.{png,svg}` | LEAF6 | b=6 | https://amitdobry.github.io/workshop/?ref=LEAF6 |

Format: error correction level M, 4-module quiet zone, black on white. The SVG scales to any
print size; the PNG is 1200 × 1200 px. Print each code at least 2 cm wide and keep the white
margin. Every batch is **unassigned** in the database until Amit decides who distributes it;
that decision is recorded on the server, never on the leaflet.

Not served by the site: this folder is outside `public/` and `landing/`.
