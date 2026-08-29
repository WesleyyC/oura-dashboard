import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

import { RANGES } from "../../../features/dashboard/presentation/health-ui.ts";

const root = new URL("../../../", import.meta.url);
function extractCssBlock(source, header) {
  const start = source.indexOf(header);
  assert.notEqual(start, -1, `Missing CSS block: ${header}`);

  const openBrace = source.indexOf("{", start + header.length);
  assert.notEqual(openBrace, -1, `Missing opening brace: ${header}`);

  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    if (source[index] === "{") {
      depth += 1;
    } else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return {
          body: source.slice(openBrace + 1, index),
          end: index + 1,
          start,
        };
      }
    }
  }

  assert.fail(`Missing closing brace: ${header}`);
}

async function render(
  path = "/",
  { email = "owner@example.com", env = {} } = {},
) {
  const workerUrl = new URL("../../../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: {
        accept: "text/html",
        "oai-authenticated-user-id": "test-user",
        "oai-authenticated-user-email": email,
      },
    }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
      AUTH_PROVIDER: "chatgpt-sites",
      OWNER_EMAIL_ALLOWLIST: "owner@example.com",
      ...env,
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

async function renderAnonymous(path) {
  const workerUrl = new URL("../../../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-anonymous`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

function exhaustedRateLimitDatabase() {
  return {
    prepare() {
      return {
        bind() {
          return {
            async run() {
              return { success: true, results: [], meta: { changes: 0 } };
            },
            async all() {
              return {
                success: true,
                results: [{ request_count: 31, requestCount: 31 }],
                meta: { changes: 1 },
              };
            },
            async raw() {
              return [[31]];
            },
          };
        },
      };
    },
  };
}

function assertGlobalSecurityHeaders(response) {
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(
    response.headers.get("strict-transport-security"),
    "max-age=31536000",
  );
  assert.match(
    response.headers.get("content-security-policy") ?? "",
    /default-src 'self'.*frame-ancestors 'none'.*connect-src 'self'/,
  );
}

test("worker rate limits an authenticated mutation before parsing its body", async () => {
  const workerUrl = new URL("../../../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-rate-limit`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/api/profiles", {
      method: "POST",
      headers: {
        "oai-authenticated-user-id": "test-user",
        "oai-authenticated-user-email": "owner@example.com",
      },
    }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
      AUTH_PROVIDER: "chatgpt-sites",
      DB: exhaustedRateLimitDatabase(),
      SECURITY_RATE_LIMIT_KEY: "REPLACE_WITH_RATE_LIMIT_KEY_000000000000000",
    },
    { waitUntil() {}, passThroughOnException() {} },
  );

  assert.equal(response.status, 429);
  const retryAfter = Number(response.headers.get("retry-after"));
  assert.ok(Number.isInteger(retryAfter));
  assert.ok(retryAfter >= 1 && retryAfter <= 60);
  assert.deepEqual(await response.json(), { error: "rate_limited" });
});

test("guest Oura connection shell renders anonymously with safe headers", async () => {
  const response = await renderAnonymous("/connect/oura");
  assert.equal(response.status, 200);
  assertGlobalSecurityHeaders(response);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");

  const html = await response.text();
  assert.match(html, /<title>Connect Oura(?:[^<]*)<\/title>/i);
  assert.match(html, /Connect Oura/i);
  assert.match(html, /Checking connection link/i);
  assert.doesNotMatch(html, /Dashboard account|Connected people|health records/i);
});

test("owner pages admit approved identities and redirect rejected identities", async () => {
  const approved = await render("/");
  assert.equal(approved.status, 200);

  for (const path of ["/", "/settings"]) {
    const rejected = await render(path, { email: "other@example.org" });
    assert.equal(rejected.status, 307);
    assert.equal(
      new URL(rejected.headers.get("location")).pathname,
      "/access-denied",
    );
  }
});

test("owner pages fail closed when allowlist configuration is unavailable", async () => {
  const response = await render("/", {
    env: { OWNER_EMAIL_ALLOWLIST: undefined },
  });

  assert.equal(response.status, 307);
  const location = new URL(response.headers.get("location"));
  assert.equal(location.pathname, "/access-denied");
  assert.equal(location.searchParams.get("reason"), "unavailable");
});

test("access-denied page exposes safe recovery without identity data", async () => {
  const response = await renderAnonymous("/access-denied");

  assert.equal(response.status, 200);
  assertGlobalSecurityHeaders(response);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");

  const html = await response.text();
  assert.match(html, /ChatGPT account is not approved for Oura Dashboard/i);
  assert.match(html, /\/signout-with-chatgpt\?return_to=%2F/i);
  assert.doesNotMatch(html, /owner@example\.com|other@example\.org/i);
});

test("uses the generated orbit mark across dashboard and connection branding", async () => {
  const [dashboard, guest, completion, styles] = await Promise.all([
    render(),
    renderAnonymous("/connect/oura"),
    renderAnonymous("/connect/oura/complete?status=connected"),
    readFile(new URL("../../../app/globals.css", import.meta.url), "utf8"),
  ]);
  const [dashboardHtml, guestHtml, completionHtml] =
    await Promise.all([
      dashboard.text(),
      guest.text(),
      completion.text(),
    ]);

  assert.match(
    dashboardHtml,
    /<h1[^>]*class="dashboard-brand-title"[^>]*>[\s\S]*class="brand-mark dashboard-brand-mark"[^>]*aria-hidden="true"[\s\S]*Oura Dashboard[\s\S]*<\/h1>/i,
  );
  assert.match(
    guestHtml,
    /class="brand-mark guest-brand-mark"[^>]*aria-hidden="true"[\s\S]*<h1[^>]*>Connect Oura<\/h1>/i,
  );
  assert.match(
    completionHtml,
    /class="brand-mark guest-brand-mark"[^>]*aria-hidden="true"[\s\S]*<h1[^>]*>Oura is connected<\/h1>/i,
  );
  assert.match(
    styles,
    /\.brand-mark\s*\{[^}]*background-image:\s*url\("\/brand\/oura-orbit-light\.png"\)/i,
  );
  assert.match(
    styles,
    /@media \(prefers-color-scheme: dark\)[\s\S]*\.brand-mark\s*\{[^}]*background-image:\s*url\("\/brand\/oura-orbit-dark\.png"\)/i,
  );
});

test("server-renders the Oura Dashboard shell", async () => {
  const [response, page, styles] = await Promise.all([
    render(),
    readFile(new URL("../../../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.equal(response.status, 200);
  assertGlobalSecurityHeaders(response);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.match(page, /requireOwner\("\/"\)/);
  assert.match(page, /export const dynamic\s*=\s*"force-dynamic"/);

  const html = await response.text();
  assert.match(html, /<title>Oura Dashboard(?:[^<]*)<\/title>/i);
  assert.match(html, /<meta name="application-name" content="Oura Dashboard"\/>/i);
  assert.match(html, /<meta property="og:title" content="Oura Dashboard"\/>/i);
  assert.match(html, /<meta property="og:image" content="\/oura-dashboard-social\.png"\/>/i);
  assert.match(
    html,
    /<link[^>]*rel="icon"[^>]*href="\/favicon-light\.png"[^>]*media="\(prefers-color-scheme: light\)"/i,
  );
  assert.match(
    html,
    /<link[^>]*rel="icon"[^>]*href="\/favicon-dark\.png"[^>]*media="\(prefers-color-scheme: dark\)"/i,
  );
  assert.match(html, /<link[^>]*rel="shortcut icon"[^>]*href="\/favicon\.ico"/i);
  assert.match(
    html,
    /<link[^>]*rel="apple-touch-icon"[^>]*href="\/apple-touch-icon\.png"/i,
  );
  assert.match(html, /<link[^>]*rel="manifest"[^>]*href="\/manifest\.webmanifest"/i);
  assert.match(html, /<main\b/i);
  assert.match(
    html,
    /<h1[^>]*class="dashboard-brand-title"[^>]*>[\s\S]*Oura Dashboard[\s\S]*<\/h1>/i,
  );
  assert.match(html, /Loading profiles/i);
  assert.doesNotMatch(html, />Alex<|>Blair</i);
  assert.match(html, /class="dashboard-selector-group"/i);
  assert.match(
    html,
    /<button[^>]*class="dashboard-selector-trigger"[^>]*id="person-trigger"[^>]*aria-haspopup="listbox"[^>]*aria-expanded="false"[^>]*disabled/i,
  );
  assert.match(
    html,
    /<button[^>]*class="dashboard-selector-trigger"[^>]*id="range-trigger"[^>]*aria-haspopup="listbox"[^>]*aria-expanded="false"/i,
  );
  assert.doesNotMatch(html, /<select|desktop-filter-controls|mobile-filter-row/i);
  assert.match(html, />7 days</i);
  assert.match(
    html,
    /<a[^>]*class="settings-link settings-button"[^>]*aria-label="Settings"[^>]*>[\s\S]*<svg/i,
  );
  assert.match(html, /class="dashboard-utility"/i);
  assert.match(html, /class="dashboard-status"/i);
  assert.match(
    html,
    /<button[^>]*class="dashboard-refresh-button"[^>]*aria-label="Refresh Oura data"[^>]*aria-busy="false"[^>]*>[\s\S]*<svg/i,
  );
  assert.doesNotMatch(html, />Refresh<|>Settings<\/a>/i);
  assert.doesNotMatch(html, /Oura health dashboard|class="lede"|Refresh data/i);
  assert.match(html, /class="dashboard-loading-shell"/i);
  assert.match(html, /class="score-strip score-strip-placeholder"/i);
  assert.match(
    styles,
    /\.dashboard-refresh-button,\s*\.settings-button\s*\{[^}]*width:\s*44px[^}]*height:\s*44px[^}]*padding:\s*0/i,
  );
  assert.doesNotMatch(html, /<svg[^>]*class="score-line-chart"/i);
  assert.doesNotMatch(html, /trend-bar|trend-column/i);
  assert.doesNotMatch(html, /Possible relationships|Calendar context|Busy time|descriptive, not causal/i);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site|codex-preview/i);
  assert.doesNotMatch(html, /react-loading-skeleton/i);
});

test("uses concise dashboard copy", async () => {
  const [response, individual, family] = await Promise.all([
    render(),
    readFile(new URL("../../../features/dashboard/components/IndividualHealthView.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../../features/dashboard/components/FamilyHealthView.tsx", import.meta.url), "utf8"),
  ]);
  const html = await response.text();

  assert.match(html, /<meta name="description" content="Oura scores, trends, and daily health signals\."\/>/i);
  assert.doesNotMatch(html, /Oura health dashboard|class="lede"/i);
  assert.match(individual, /Score trends/i);
  assert.match(individual, /absolute Oura scores/i);
  assert.doesNotMatch(individual, /Difference from 6-month baseline/i);
  assert.match(individual, /Health averages/i);
  assert.match(individual, /Daily details/i);
  assert.doesNotMatch(individual, /About this data/i);
  assert.doesNotMatch(
    individual,
    /Averages exclude missing days\. Calendar data is not included\./i,
  );
  assert.match(family, /About comparisons/i);
  assert.match(
    family,
    /Profiles stay separate, and missing values remain missing\./i,
  );
  assert.doesNotMatch(html, /Private Oura dashboard/i);
  assert.doesNotMatch(individual, /Private by design/i);
  assert.doesNotMatch(family, /Private profiles/i);
  assert.doesNotMatch(html, /Private Oura view/i);
  assert.doesNotMatch(html, /Score rhythm/i);
  assert.doesNotMatch(html, /Selected-range averages/i);
  assert.doesNotMatch(html, /Daily Oura detail/i);
});

test("server-renders a URL-addressed family view", async () => {
  const response = await render("/?view=family");
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(
    html,
    /<button[^>]*id="range-trigger"[^>]*aria-haspopup="listbox"[\s\S]*?id="range-value">7 days</i,
  );
  assert.match(html, /Loading profiles/i);
  assert.doesNotMatch(html, /Alex average|Blair average|Blair − Alex/i);
  assert.doesNotMatch(html, /<title id="family-(?:readinessScore|sleepScore|activityScore)/i);
});

test("settings renders family management without secret values", async () => {
  const [response, page, setup, profileCard, controller, picker, styles] = await Promise.all([
    render("/settings"),
    readFile(new URL("../../../app/settings/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../../features/profile-management/components/SettingsScreen.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../../features/profile-management/components/ProfileCard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../../features/profile-management/model/use-settings-controller.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../features/profile-management/components/ProfileColorPicker.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../../app/globals.css", import.meta.url), "utf8"),
  ]);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(page, /requireOwner\("\/settings"\)/);
  assert.match(html, /<h1>Settings<\/h1>/i);
  assert.match(html, /Oura connection/i);
  assert.match(html, /Add person/i);
  assert.match(html, /Connected people/i);
  assert.match(html, /Dashboard account/i);
  assert.match(html, /Manage the people connected to this dashboard\./i);
  assert.match(setup, /"Connect here"/i);
  assert.match(setup, /"Send link"/i);
  assert.doesNotMatch(html, /App credentials are managed in Sites Settings\./i);
  assert.match(html, /Manage names, colors, order, and Oura connections\./i);
  assert.match(
    setup,
    /id="connected-people"[\s\S]*id="oura-connection"[\s\S]*id="dashboard-account"/i,
  );
  assert.match(setup, /Back to dashboard/i);
  assert.match(setup, /aria-controls="add-person-panel"/i);
  assert.match(setup, /<details className="account-disclosure">/i);
  assert.match(setup, /className="connected-people-actions"/i);
  assert.match(profileCard, /className="profile-order-controls"/i);
  assert.match(profileCard, /ProfileColorPicker/);
  assert.match(
    controller,
    /updateProfile\(\{\s*profileId,\s*colorKey\s*\}\)/s,
  );
  assert.match(picker, /DashboardSelector/i);
  assert.match(picker, /presentation="menu"/i);
  assert.match(picker, /descriptionId=\{descriptionId\}/i);
  assert.doesNotMatch(picker, /type="radio"|profile-color-options/i);
  for (const key of [
    "ocean",
    "berry",
    "meadow",
    "sunset",
    "iris",
    "lagoon",
  ]) {
    assert.equal(
      styles.match(new RegExp(`--profile-${key}:`, "g"))?.length,
      2,
      `${key} needs light and dark tokens`,
    );
  }
  assert.match(styles, /\.profile-color-picker\s*\{[^}]*max-width:\s*320px/i);
  assert.doesNotMatch(html, /Health Rhythm/i);
  assert.doesNotMatch(
    setup,
    /stores daily Oura summaries and workout totals/i,
  );
  assert.match(html, /Delete dashboard data/i);
  assert.match(
    styles,
    /\.field-action\s*>\s*button\s*\{[^}]*white-space:\s*nowrap/i,
  );
  assert.match(
    styles,
    /\.add-profile-form\s+\.primary-button\s*\{[^}]*min-width:\s*132px/i,
  );
  assert.match(
    styles,
    /\.danger-zone\s+\.danger-button\s*\{[^}]*min-width:\s*180px/i,
  );
  assert.match(
    styles,
    /\.danger-zone\s*\{[^}]*display:\s*block/i,
  );
  assert.match(
    styles,
    /\.danger-zone\s*>\s*div\s*\{[^}]*margin-bottom:\s*28px/i,
  );
  assert.match(
    styles,
    /@media \(max-width: 760px\)[\s\S]*?\.field-action\s*\{[^}]*flex-direction:\s*column/i,
  );
  assert.match(
    styles,
    /@media \(max-width: 760px\)[\s\S]*?\.connected-people-actions\s*\{[^}]*width:\s*100%/i,
  );
  assert.match(
    styles,
    /\.connection-choice-actions\s*\{[^}]*display:\s*flex/i,
  );
  assert.match(
    styles,
    /\.oura-handoff-panel\s*\{[^}]*border:\s*1px solid/i,
  );
  assert.match(
    styles,
    /@media \(max-width: 760px\)[\s\S]*?\.connection-choice-actions\s*\{[^}]*flex-direction:\s*column/i,
  );
  assert.doesNotMatch(html, /inside your private dashboard/i);
  assert.doesNotMatch(
    html,
    /OURA_CLIENT_SECRET|OURA_TOKEN_ENCRYPTION_KEY|client_secret|refresh_token/i,
  );
});

test("shared selectors adapt through CSS without a second responsive tree", async () => {
  const styles = await readFile(
    new URL("../../../app/globals.css", import.meta.url),
    "utf8",
  );

  assert.match(
    styles,
    /\.dashboard-selector-group\s*\{[^}]*display:\s*flex[^}]*min-width:\s*0/i,
  );
  assert.match(
    styles,
    /\.dashboard-selector\s*\{[^}]*position:\s*relative[^}]*min-width:\s*0/i,
  );
  assert.match(
    styles,
    /\.dashboard-selector-trigger\s*\{[^}]*min-height:\s*44px[^}]*grid-template-columns:\s*auto minmax\(0, 1fr\) auto/i,
  );
  assert.match(
    styles,
    /\.dashboard-selector-listbox\s*\{[^}]*position:\s*absolute[^}]*width:\s*max\(100%, 176px\)[^}]*max-width:\s*calc\(100vw - 32px\)[^}]*max-height:\s*min\(320px, calc\(100dvh - 120px\)\)[^}]*overflow-y:\s*auto/i,
  );
  assert.match(
    styles,
    /\.dashboard-selector-listbox\s*\{[^}]*display:\s*none/i,
  );
  assert.match(
    styles,
    /\.dashboard-selector\[data-open="true"\][\s\S]*?\.dashboard-selector-listbox\s*\{[^}]*display:\s*block/i,
  );
  assert.match(
    styles,
    /\.dashboard-selector-option\s*\{[^}]*min-height:\s*44px/i,
  );
  assert.match(
    styles,
    /\.dashboard-selector-option-label\s*\{[^}]*overflow-wrap:\s*anywhere/i,
  );
  assert.match(
    styles,
    /\.dashboard-selector-mark\s*\{[^}]*background:\s*var\(--profile-color\)/i,
  );
  assert.match(
    styles,
    /\.dashboard-selector\[data-open="true"\][\s\S]*?\.dashboard-selector-chevron\s*\{[^}]*transform:\s*rotate\(180deg\)/i,
  );
  assert.match(
    styles,
    /@media \(min-width: 761px\)[\s\S]*?\.dashboard-selector\[data-presentation="adaptive"\] \.dashboard-selector-trigger\s*\{[^}]*display:\s*none/i,
  );
  assert.match(
    styles,
    /@media \(min-width: 761px\)[\s\S]*?#person-listbox\s*\{[^}]*display:\s*flex[^}]*overflow-x:\s*auto/i,
  );
  assert.match(
    styles,
    /@media \(min-width: 761px\)[\s\S]*?#range-listbox\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(5, minmax\(64px, 1fr\)\)/i,
  );
  assert.match(
    styles,
    /@media \(min-width: 761px\)[\s\S]*?\.dashboard-selector\[data-presentation="adaptive"\] \.dashboard-selector-listbox\s*\{[^}]*gap:\s*3px/i,
  );
  assert.match(
    styles,
    /@media \(min-width: 761px\)[\s\S]*?\.dashboard-selector\[data-presentation="adaptive"\] \.dashboard-selector-option\s*\{[^}]*padding:\s*0 14px[^}]*border-radius:\s*9px[^}]*font-size:\s*0\.875rem/i,
  );
  assert.match(
    styles,
    /\.dashboard-selector\[data-presentation="menu"\]\s*\{[^}]*max-width:\s*320px/i,
  );
  assert.match(
    styles,
    /@media \(max-width: 760px\)[\s\S]*?\.dashboard-selector-group\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/i,
  );
  assert.match(
    styles,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.dashboard-selector-trigger,[\s\S]*?\.dashboard-selector-listbox\s*\{[^}]*transition:\s*none/i,
  );
  assert.doesNotMatch(
    styles,
    /\.desktop-filter-controls|\.mobile-filter-row|\.mobile-filter-field|\.view-control|\.range-control/i,
  );
  assert.match(
    styles,
    /\.dashboard-refresh-button\[data-refreshing="true"\][\s\S]*animation:/i,
  );
  assert.match(
    styles,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.dashboard-refresh-button\[data-refreshing="true"\][^{]*\{[^}]*animation:\s*none/i,
  );
  assert.match(
    styles,
    /@media \(max-width: 420px\)[\s\S]*?\.dashboard-status-detail\s*\{[^}]*display:\s*none/i,
  );
  assert.match(
    styles,
    /@media \(max-width: 420px\)[\s\S]*?\.score-strip-placeholder/i,
  );
});

test("mobile layout does not force a fixed root width beside classic scrollbars", async () => {
  const styles = await readFile(
    new URL("../../../app/globals.css", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(styles, /html\s*\{[^}]*min-width:/i);
});

test("dashboard carries profile colors through every member identity surface", async () => {
  const [dashboard, individual] = await Promise.all([
    readFile(new URL("../../../features/dashboard/components/DashboardScreen.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../../features/dashboard/components/IndividualHealthView.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(dashboard, /profileColorCssValue\(profile\.colorKey\)/);
  assert.match(
    dashboard,
    /color:\s*profileColorCssValue\(profile\.colorKey\)/,
  );
  assert.match(dashboard, /<DashboardSelector[\s\S]*?id="person"/);
  assert.match(dashboard, /profileId=\{displaySelectedProfile\.profile\.id\}/);
  assert.match(dashboard, /colorKey=\{displaySelectedProfile\.profile\.colorKey\}/);
  assert.match(individual, /profileId:\s*string/);
  assert.match(individual, /colorKey:\s*ProfileColorKey/);
});

test("presents score metrics in Readiness, Sleep, Activity order", async () => {
  const source = await readFile(
    new URL("../../../features/dashboard/components/IndividualHealthView.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /Readiness[\s\S]*Sleep[\s\S]*Activity/i);
  assert.match(
    source,
    /key:\s*"readiness"[\s\S]*key:\s*"sleep"[\s\S]*key:\s*"activity"/i,
  );
});

test("dashboard charts share one pointer, touch, and keyboard date-selection boundary", async () => {
  const source = await readFile(
    new URL("../../../features/dashboard/components/IndividualHealthView.tsx", import.meta.url),
    "utf8",
  );
  const panel = await readFile(
    new URL("../../../features/dashboard/components/ScoreTrendPanel.tsx", import.meta.url),
    "utf8",
  ).catch(() => "");
  const selection = await readFile(
    new URL("../../../features/dashboard/components/ChartDateSelection.tsx", import.meta.url),
    "utf8",
  ).catch(() => "");
  const [metricChart, family, styles] = await Promise.all([
    readFile(
      new URL("../../../features/dashboard/components/MetricTrendChart.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../../../features/dashboard/components/FamilyHealthView.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../../../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(source, /id="individual-metric-explorer"/i);
  assert.match(source, /aria-controls="individual-metric-explorer"/i);
  assert.match(source, /MetricTrendChart/);
  assert.match(source, /compareLatestToRange/);
  assert.match(source, /trendWindowDays\(range\)/);
  assert.match(source, /rangeDateTicks\(range,\s*today\)/);
  assert.match(source, /ScoreTrendPanel/);
  assert.match(source, /SCORE_SERIES\.map/);
  assert.match(source, /scoreTrendDomain/);
  assert.doesNotMatch(source, /Difference from 6-month baseline/i);
  assert.match(panel, /<ChartDateSelection/i);
  assert.match(selection, /role:\s*"slider"/i);
  assert.match(selection, /onPointerMove:\s*selectFromPointer/i);
  assert.match(selection, /onPointerDown:/i);
  assert.match(selection, /onKeyDown:\s*handleKeyDown/i);
  assert.match(selection, /"aria-valuetext":\s*ariaValueText\(activePoint\)/i);
  assert.match(metricChart, /<ChartDateSelection/i);
  assert.match(metricChart, /<ChartDateReadout/i);
  assert.match(family, /<ChartDateSelection/i);
  assert.match(family, /<ChartDateReadout/i);
  assert.match(styles, /\.chart-date-readout-values\s*\{[^}]*flex-wrap:\s*wrap/i);
  assert.match(styles, /\.chart-selection-surface:focus-visible\s*\{[^}]*outline:/i);
  assert.match(panel, /score-trend-readout/i);
  assert.match(panel, /<table className="visually-hidden">/i);
  assert.doesNotMatch(source, /data-pattern|long-dash|short-dash/);
  assert.doesNotMatch(source, /readinessDelta|sleepDelta|activityDelta/i);
});

test("wide individual and family score panels share one three-column layout", async () => {
  const styles = await readFile(
    new URL("../../../app/globals.css", import.meta.url),
    "utf8",
  );
  const wide = extractCssBlock(styles, "@media (min-width: 1180px)");
  const outsideWide = styles.slice(0, wide.start) + styles.slice(wide.end);

  assert.match(
    wide.body,
    /\.score-trend-panels,\s*\.family-score-panels\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);[^}]*gap:\s*24px;/i,
  );
  assert.match(
    wide.body,
    /\.score-trend-panel,\s*\.family-score-panel\s*\{[^}]*min-width:\s*0;/i,
  );
  assert.match(
    wide.body,
    /\.family-score-heading\s*\{[^}]*flex-direction:\s*column;/i,
  );
  assert.match(
    wide.body,
    /\.family-score-summary\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/i,
  );
  assert.doesNotMatch(
    outsideWide,
    /\.(?:score-trend-panels|family-score-panels)\s*\{[^}]*grid-template-columns:\s*repeat\(2,/i,
  );
});

test("metric explorer uses solid series, range averages, and accessible data", async () => {
  const source = await readFile(new URL("../../../features/dashboard/components/MetricTrendChart.tsx", import.meta.url), "utf8");

  assert.match(source, /7-day moving average/);
  assert.match(source, /Range average/);
  assert.match(source, /role="img"/);
  assert.match(source, /<table className="visually-hidden">/);
  assert.match(source, /MetricTrendChart/);
  assert.match(source, /today:\s*string/);
  assert.match(source, /rangeDateTicks\(range,\s*today\)/);
  assert.match(source, /dateRangePosition\(date,\s*window\)/);
  assert.doesNotMatch(source, /strokeDasharray|data-pattern/);
});

test("family view exposes solid score lines and a selectable detailed comparison", async () => {
  const [source, comparison] = await Promise.all([
    readFile(new URL("../../../features/dashboard/components/FamilyHealthView.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../../features/dashboard/components/FamilyComparison.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(source, /Health comparison/i);
  assert.match(source, /selected-range averages/i);
  assert.match(source, /id="family-metric-explorer"/i);
  assert.match(source, /profile\.displayName/);
  assert.match(comparison, /profiles\.length === 2/);
  assert.match(comparison, /aria-controls="family-metric-explorer"/i);
  assert.match(comparison, /METRIC_GROUPS/);
  assert.match(comparison, /compareLatestToRange\(summary,\s*metric\.comparison\)/);
  assert.doesNotMatch(comparison, /baselineSummary|compareMetricToBaseline|Near usual|No baseline/i);
  assert.match(source, /summary:\s*summarize\(visibleRecords\)/);
  assert.match(source, /MetricTrendChart/);
  assert.match(source, /trendWindowDays\(range\)/);
  assert.match(source, /familyScoreDomain/);
  assert.match(source, /familyScoreTicks/);
  assert.match(source, /rangeDateTicks\(range,\s*today\)/);
  assert.match(source, /dateRangePosition\(point\.date,\s*window\)/);
  assert.match(source, /Chart scale/);
  assert.doesNotMatch(source, /fixed 0–100 scale|FAMILY_TICKS\s*=\s*\[0,\s*25,\s*50,\s*75,\s*100\]/);
  assert.doesNotMatch(source, /data-pattern|long-dash|short-dash/);
});

test("every chart owns a text legend and uses durable profile identity colors", async () => {
  const [individual, family, comparison, metric, score] = await Promise.all([
    readFile(new URL("../../../features/dashboard/components/IndividualHealthView.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../../features/dashboard/components/FamilyHealthView.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../../features/dashboard/components/FamilyComparison.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../../features/dashboard/components/MetricTrendChart.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../../features/dashboard/components/ScoreTrendPanel.tsx", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(family, /PROFILE_COLORS|profileColor\(index\)|--family-series-/);
  assert.match(family, /profileColorCssValue\(profile\.colorKey\)/);
  assert.match(
    family,
    /className="family-score-summary"[\s\S]*?aria-label=\{`\$\{score\.label\} chart legend`\}/,
  );
  assert.match(
    family,
    /profiles\.map[\s\S]*?chart-legend-line[\s\S]*?profile\.displayName/,
  );
  assert.match(
    comparison,
    /className="profile-identity-mark family-table-profile-mark"/,
  );
  assert.match(
    individual,
    /identity:\s*\{\s*type:\s*"person",\s*profileId,\s*color:\s*profileColor/s,
  );
  assert.match(
    metric,
    /className="metric-chart-legend"[\s\S]*?<\/header>\s*<div className="metric-chart-frame"/,
  );

  for (const source of [score, family, metric]) {
    assert.match(source, /<table className="visually-hidden">/);
  }
});

test("range choices stay complete in the shared selector", async () => {
  const dashboard = await readFile(
    new URL("../../../features/dashboard/components/DashboardScreen.tsx", import.meta.url),
    "utf8",
  );

  assert.deepEqual(RANGES.map(({ key, label }) => [key, label]), [
    ["7d", "7 days"],
    ["14d", "2 weeks"],
    ["30d", "1 month"],
    ["3m", "3 months"],
    ["6m", "6 months"],
  ]);
  assert.match(dashboard, /rangeSelectorOptions/);
  assert.match(dashboard, /<DashboardSelector[\s\S]*?id="range"/);
  assert.doesNotMatch(dashboard, /desktop-filter-controls|mobile-filter-row|<select/i);
});

test("removes the disposable starter and external font dependency", async () => {
  const [
    page,
    layout,
    packageJson,
    styles,
    dashboard,
    dashboardApi,
    dashboardController,
    scoreTrend,
    family,
  ] = await Promise.all([
    readFile(new URL("../../../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../../package.json", import.meta.url), "utf8"),
    readFile(new URL("../../../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../../../features/dashboard/components/DashboardScreen.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../../features/dashboard/client/dashboard-api.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../features/dashboard/model/use-dashboard-controller.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../features/dashboard/components/ScoreTrendPanel.tsx", import.meta.url), "utf8").catch(() => ""),
    readFile(new URL("../../../features/dashboard/components/FamilyHealthView.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /<DashboardScreen/);
  assert.match(layout, /title:\s*"Oura Dashboard"/);
  assert.doesNotMatch(layout, /next\/font/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("../../../app/_sites-preview", import.meta.url)));
  assert.match(layout, /icons:\s*\{/);
  await Promise.all([
    access(new URL("../../../public/favicon-light.png", import.meta.url)),
    access(new URL("../../../public/favicon-dark.png", import.meta.url)),
    access(new URL("../../../public/favicon.ico", import.meta.url)),
    access(new URL("../../../public/apple-touch-icon.png", import.meta.url)),
  ]);
  await access(new URL("../../../features/dashboard/components/DashboardScreen.tsx", import.meta.url));
  await access(new URL("../../../features/dashboard/components/IndividualHealthView.tsx", import.meta.url));
  await access(new URL("../../../features/dashboard/components/FamilyHealthView.tsx", import.meta.url));
  await access(new URL("../../../features/dashboard/presentation/health-ui.ts", import.meta.url));
  await access(new URL("../../../app/globals.css", import.meta.url));
  assert.match(styles, /\.score-trend-surface\s*\{[^}]*touch-action:\s*pan-y/i);
  assert.match(styles, /\.score-trend-surface:focus-visible\s*\{[^}]*outline:/i);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*\.score-trend-panel-heading/i);
  assert.match(styles, /@media \(max-width: 420px\)[\s\S]*\.score-item p\s*\{\s*display:\s*none/i);
  assert.match(styles, /table\.visually-hidden\s*\{[\s\S]*display:\s*block\s*!important;[\s\S]*max-width:\s*1px\s*!important;/i);
  assert.doesNotMatch(styles, /\.chart-point|\.chart-points/i);
  assert.doesNotMatch(dashboard, /HEALTH_PROFILES|DISPLAY_NAMES/);
  assert.match(dashboardApi, /profile=\$\{profile\.profile\.slug\}/);
  assert.match(dashboardController, /history\.replaceState/);
  assert.match(scoreTrend, /<table className="visually-hidden">[\s\S]*<th>Date<\/th><th>Score<\/th>/i);
  assert.match(family, /Readiness[\s\S]*Sleep[\s\S]*Activity/);
  assert.match(family, /familyScoreDomain/);
  assert.match(family, /familyScoreTicks/);
  assert.doesNotMatch(family, /FAMILY_TICKS\s*=\s*\[0,\s*25,\s*50,\s*75,\s*100\]/);
  assert.match(family, /profiles\.length === 2/);
  assert.match(family, /Shared days/);
  assert.doesNotMatch(family, /data-pattern|long-dash|short-dash/);
  assert.match(family, /<table className="visually-hidden">/i);
  await access(root);
});
