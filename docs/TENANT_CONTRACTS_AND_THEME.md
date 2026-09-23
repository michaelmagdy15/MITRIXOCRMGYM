# Tenant contracts and Inzan appearance

## Contracts

`src/config/contractTemplates.ts` maps resolved tenant IDs to independent public PDF assets and form fields. Add an explicit entry for each new tenant. There is intentionally no fallback to Strike for unknown tenants. Both member-list and member-profile actions use the same generator and browser download helper; neither invokes Web Share.

Inzan's two-page template preserves the supplied logo and all 25 clauses. The source was rendered at 2400-pixel height, and the complete populated member/invoice area and browser footer were removed from the pixels before a new PDF was built. This avoids retaining hidden source member data, receipt links, or annotations underneath white overlays. Only sanitized page images and new empty AcroForm fields are shipped. The original source PDF is not included.

The generator fills member ID, name, mobile, gender, nationality, birthday, package, package dates, latest recorded payment, payment method/date/receipt, generation time, and staff name. Missing facts remain empty. It does not invent invitation/freezing allowances, total contract price, discounts or remaining balances from an unrelated latest payment. The payment amount is explicitly labelled as the latest payment, not the full contract cost. Agreements remain fillable. Unsupported font characters produce a visible error rather than silently losing member information.

## Inzan palette

`src/styles/inzan-theme.css` scopes black (#000000), card (#1A1A1A), and raised surface (#2B2B2B) colors to Inzan's root tenant attribute, with light text and visible focus outlines. Inzan always uses dark mode; its theme switches are disabled. Other tenants retain their theme preference and appearance. Semantic warning/error/success colors and chart series remain distinguishable. The printable agreement retains its supplied white paper design.

The Expo Inzan profile and native shell use black splash, WebView, safe-area, status/navigation bar and offline backgrounds. Strike native values are unchanged. Web changes require deployment; native shell changes require a new Inzan app build/release.

## Verification

Start Vite on port 5174, then run `node scripts/verify-contracts-theme.cjs` (Edge installed). The test uses synthetic data, saves actual downloads, checks fields and tenant palette isolation, and detects any Web Share calls. On Windows use CHOKIDAR_USEPOLLING=true if a download triggers a file-watcher lock. Outputs are under tmp/pdfs and must not be committed.

Additional checks: npm run build; npm run lint; JSX transform and both Expo profile resolutions; PDF rendering and AcroForm/widget checks. Authenticated production member screens and physical iOS/Android behavior still require post-deployment smoke testing.
