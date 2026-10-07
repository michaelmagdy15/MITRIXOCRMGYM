# Bravo and Delta brochure

Created 8 October 2026 for Michael Mitry.

## Product architecture

MITRIXO is the umbrella brand. Bravo is the boxing and combat-sports edition, using the Strike Boxing configuration as its reference. Delta is the multi-service fitness edition, using the Inzan Athletics configuration as its reference. These are commercial positioning choices requested by the owner, not existing technical release identifiers or exclusive feature tiers.

## Core pitch

MITRIXO is white-label gym management software that connects memberships, payments, bookings, staff workflows and a branded member experience. Bravo focuses on boxing clubs and combat-sports gyms. Delta focuses on fitness clubs and multi-service training centres.

## Evidence and claim limits

- Platform scope: MASTER.md, TENANTS.md, GAPS.md and the Inzan operational manual.
- Host configuration and tenant-specific database selection: src/utils/tenantDb.ts.
- Known release and integration limitations: GAPS.md and docs/INZAN_PRD_COMPLIANCE_STATUS.md.
- The brochure does not claim production certification, guaranteed revenue improvements, uptime, regulatory certification, deployment lead times, an included native app-store release, or completed third-party integrations.
- Inventory and equipment services without operator screens are not sold as finished user-facing modules.
- Bravo and Delta share capabilities. The comparison describes their focus rather than inventing contractual feature exclusions.
- All diagrams and the member phone are original vector illustrations. The phone is explicitly labelled illustrative, not a screenshot. No member records, credentials, or private metrics are included.
- Strike Boxing and Inzan Athletics are identified as configuration references, not quoted endorsements. No customer photography or logos are reused.
- Sales contact supplied by the owner: Michael Mitry, https://mitrixo.com and https://mi5a.com. No private account email is repurposed as a sales contact.

## Rebuild

Run docs/build_bravo_delta_brochure.py using the bundled Python runtime with ReportLab. Installed Montserrat and Open Sans fonts are required. The editable copy and layout are in this builder. Final deliverable: output/pdf/MITRIXO_BRAVO_DELTA_BROCHURE.pdf.
