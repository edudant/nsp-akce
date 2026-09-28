// Run against the local fixture from test-feature-integration.mjs only.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const fixture = JSON.parse(
  await fs.readFile("/tmp/nsp-supabase-tests/browser-fixture.json", "utf8"),
);
assert.equal(fixture.url, "http://127.0.0.1:54321");
const base = "http://127.0.0.1:5175/nsp-akce/";
const login = async (email) => {
  const r = await fetch(fixture.url + "/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: { apikey: fixture.anon, "content-type": "application/json" },
    body: JSON.stringify({ email, password: fixture.password }),
  });
  assert.equal(r.status, 200);
  return r.json();
};
const browser = await chromium.launch({ headless: true });
const errors = [];
let checks = 0;
const pass = (name) => {
  checks++;
  console.log("OK " + name);
};
const screenshotDir = "/tmp/nsp-supabase-tests/screenshots";
await fs.mkdir(screenshotDir, { recursive: true });
const newPage = async (session, width = 1440) => {
  const context = await browser.newContext({
    viewport: { width, height: 1000 },
  });
  if (session)
    await context.addInitScript(
      (s) => localStorage.setItem("sb-127-auth-token", JSON.stringify(s)),
      session,
    );
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  return page;
};
const go = async (page, route, heading) => {
  await page.goto(base + "#" + route);
  await page.getByRole("heading", { name: heading, exact: true }).waitFor();
};
const noOverflow = async (page) =>
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "Page horizontal overflow",
  );
try {
  const session = await login(fixture.adminEmail),
    admin = await newPage(session),
    member = await newPage(await login(fixture.memberEmail), 390);
  const dbRes = await fetch(fixture.url + "/rest/v1/rpc/get_app_database_v3", {
    method: "POST",
    headers: {
      apikey: fixture.anon,
      Authorization: "Bearer " + session.access_token,
      "content-type": "application/json",
    },
    body: "{}",
  });
  const db = await dbRes.json(),
    selected = db.members.filter(
      (m) =>
        m.account?.email?.includes(fixture.adminEmail.split("-")[1]) &&
        m.account.email !== fixture.adminEmail,
    );
  const own = selected.find((m) => m.account.email === fixture.memberEmail);
  await go(
    admin,
    "/udalosti/" + fixture.performance,
    db.events.find((e) => e.id === fixture.performance).title,
  );
  assert.equal(
    await admin.getByRole("button", { name: "Odebrat", exact: true }).count(),
    4,
  );
  await admin
    .getByRole("button", { name: "Přidat člena", exact: true })
    .click();
  await admin
    .getByLabel("Hledat člena k přidání")
    .fill(db.members.find((m) => m.id === db.myMemberId).fullName);
  assert.equal(
    await admin
      .getByRole("dialog")
      .getByRole("button", { name: "Přidat", exact: true })
      .count(),
    1,
  );
  await admin
    .getByRole("dialog")
    .getByRole("button", { name: "Zavřít", exact: true })
    .click();
  await admin.getByLabel("Řazení účastníků").selectOption("name");
  pass("Compact selected roster, adding search and name sorting");
  await go(admin, "/clenove", "Členové");
  await admin
    .getByRole("button", { name: "Upravit člena " + own.fullName, exact: true })
    .click();
  const dialog = admin.getByRole("dialog");
  assert.equal(
    await dialog.getByLabel("Starý", { exact: true }).isChecked(),
    true,
  );
  assert.equal(
    await dialog.getByLabel("Mladý", { exact: true }).isChecked(),
    true,
  );
  await dialog.getByLabel("Prioritní zařazení").selectOption("young");
  await dialog
    .getByRole("button", { name: "Uložit změny", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  await admin
    .getByRole("button", { name: "Upravit člena " + own.fullName, exact: true })
    .click();
  assert.equal(
    await dialog.getByLabel("Prioritní zařazení").inputValue(),
    "young",
  );
  if (process.env.NSP_BROWSER_SKIP_OTP !== "1") {
    await dialog
      .getByRole("button", { name: "Vygenerovat přihlašovací kód" })
      .click();
    await dialog.locator(".login-code").waitFor();
    const code = await dialog.locator(".login-code").innerText();
    assert.match(code, /^\d{6}$/);
    const otp = await newPage(null);
    await otp.goto(base);
    await otp.getByLabel("E-mailová adresa").fill(fixture.memberEmail);
    await otp.getByRole("button", { name: "Mám přihlašovací kód" }).click();
    await otp.getByLabel("Kód z e-mailu").fill(code);
    await otp.getByRole("button", { name: "Ověřit a přihlásit" }).click();
    await otp.locator(".app-layout").waitFor();
    pass(
      "Dual groups and priority persist; admin code signs in through the actual login form",
    );
  }
  await dialog.getByRole("button", { name: "Zavřít", exact: true }).click();
  await go(admin, "/udalosti", "Události");
  await admin
    .getByRole("button", { name: "Nová událost", exact: true })
    .click();
  assert.equal(
    await admin.getByLabel("Místo události").inputValue(),
    "Stará škola",
  );
  assert.equal(
    await admin.getByLabel("Začátek události").inputValue(),
    "19:00",
  );
  assert.equal(await admin.getByLabel("Konec události").inputValue(), "21:00");
  assert.equal(
    new Date(
      (await admin.getByLabel("Datum události").inputValue()) + "T12:00:00",
    ).getDay(),
    5,
  );
  await admin
    .getByRole("dialog")
    .getByLabel("Typ události")
    .selectOption("performance");
  const title = "Browser performance " + Date.now();
  await admin.getByLabel("Název události").fill(title);
  await admin.getByLabel("Termín pro vyjádření").fill("2026-12-01T18:00");
  await admin.getByLabel("Odhad párů Starý").fill("1");
  await admin.getByLabel("Odhad párů Mladý").fill("0");
  await admin.getByLabel("Bude se zpívat").check();
  await admin
    .getByRole("button", { name: "Vytvořit událost", exact: true })
    .click();
  await admin.getByRole("dialog").waitFor({ state: "hidden" });
  await admin.getByText(title, { exact: true }).first().click();
  await admin.getByRole("heading", { name: title, exact: true }).waitFor();
  const route = await admin.evaluate(() => location.hash.slice(1));
  pass(
    "Friday defaults and performance creation with deadline, group estimates and singing",
  );
  await go(member, route, title);
  assert.equal(await member.getByLabel("Odpověď").isDisabled(), false);
  assert.equal(
    await member
      .getByRole("button", { name: "Uložit přání", exact: true })
      .count(),
    1,
  );
  assert.ok(
    (await member.locator("body").innerText()).includes(
      "Seznam odpovědí ostatních",
    ),
  );
  await member.getByLabel("Odpověď").selectOption("maybe");
  assert.equal(
    await member.getByLabel("Poznámka k odpovědi").getAttribute("required"),
    "",
  );
  await member.getByLabel("Poznámka k odpovědi").fill("Čekám na potvrzení");
  await member.getByRole("button", { name: "Uložit odpověď" }).click();
  pass("Member sees own open response and maybe requires a note");
  await admin
    .getByRole("button", { name: "Přidat člena", exact: true })
    .click();
  for (const m of selected) {
    await admin.getByLabel("Hledat člena k přidání").fill(m.fullName);
    await admin
      .getByRole("dialog")
      .getByRole("button", { name: "Přidat", exact: true })
      .click();
    await admin
      .getByRole("dialog")
      .getByRole("button", { name: "Přidat", exact: true })
      .waitFor({ state: "hidden" });
  }
  await admin
    .getByRole("dialog")
    .getByRole("button", { name: "Zavřít", exact: true })
    .click();
  await admin
    .getByRole("link", { name: "Generátor párů", exact: true })
    .click();
  await admin.getByRole("button", { name: "Vygenerovat návrh" }).waitFor();
  for (const label of ["Preference", "Body", "Střídání", "Zkušenost"])
    assert.equal(
      await admin.getByLabel(label, { exact: true }).getAttribute("type"),
      "range",
    );
  await admin.getByLabel("Čí přání zohlednit").selectOption("follower");
  await admin.getByRole("button", { name: "Vygenerovat návrh" }).click();
  assert.equal(await admin.getByLabel("Muž v páru 1").count(), 1);
  assert.equal(await admin.getByLabel("Muž v páru 2").count(), 1);
  await admin
    .getByLabel("Žena v páru 1")
    .selectOption(await admin.getByLabel("Žena v páru 1").inputValue());
  await admin
    .getByRole("button", { name: "Uložit návrh", exact: true })
    .click();
  await admin.getByText("Návrh je uložený.", { exact: true }).waitFor();
  await admin
    .getByRole("button", { name: "Zveřejnit schválené páry", exact: true })
    .click();
  await admin.getByText("Páry jsou zveřejněné.", { exact: true }).waitFor();
  pass(
    "Performance sliders, directional wishes, main/below-line pairs, manual editor, draft and publication",
  );
  await go(admin, route, title);
  await admin.getByLabel("Název nové série").fill("Browser songs");
  await admin.getByRole("button", { name: "Vytvořit sérii" }).click();
  const series = admin.locator(".song-series").filter({
    has: admin.getByRole("heading", {
      name: "Browser songs · Návrh",
      exact: true,
    }),
  });
  await series.waitFor();
  await series
    .getByRole("button", { name: "+ Bul jest jeren sedlák", exact: true })
    .click();
  await series.getByRole("button", { name: "Uložit návrh série" }).click();
  await admin.getByLabel("Název série Browser songs").waitFor();
  await member.reload();
  await member.getByRole("heading", { name: title, exact: true }).waitFor();
  assert.equal(
    await member.getByText("Browser songs", { exact: false }).count(),
    0,
  );
  await admin
    .locator(".song-series")
    .getByRole("button", { name: "Potvrdit sérii" })
    .click();
  await admin
    .getByRole("heading", { name: "Browser songs · Potvrzená", exact: true })
    .waitFor();
  await member.reload();
  await member
    .getByRole("heading", { name: "Browser songs · Potvrzená", exact: true })
    .waitFor();
  assert.ok(
    !(await member.locator("body").innerText()).includes("PRIVATE TEST NOTE"),
  );
  await noOverflow(member);
  await member.screenshot({
    path: screenshotDir + "/member-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  pass(
    "Series drafts are hidden; confirmed series are visible on mobile without overflow",
  );
  await admin.getByLabel("Stav události").selectOption("confirmed");
  await member.reload();
  await member.getByLabel("Odpověď").waitFor();
  assert.equal(await member.getByLabel("Odpověď").isDisabled(), true);
  await member
    .getByRole("heading", { name: "Účast na události", exact: true })
    .waitFor();
  pass("Confirmation exposes roster and locks member response");
  await go(
    admin,
    "/udalosti/" + fixture.rehearsal,
    db.events.find((e) => e.id === fixture.rehearsal).title,
  );
  await admin
    .getByLabel("Skutečná účast " + own.fullName)
    .selectOption("partial");
  await admin.getByLabel("Procento účasti " + own.fullName).fill("62.5");
  await admin.getByLabel("Procento účasti " + own.fullName).press("Tab");
  await admin.waitForFunction(
    () =>
      !document.querySelector('select[aria-label^="Skutečná účast"]')?.disabled,
  );
  await admin.reload();
  await admin.getByLabel("Procento účasti " + own.fullName).waitFor();
  assert.equal(
    await admin.getByLabel("Procento účasti " + own.fullName).inputValue(),
    "62.5",
  );
  pass("Admin percentage attendance persists after reload");
  await admin
    .getByRole("link", { name: "Generátor párů", exact: true })
    .click();
  assert.equal(
    await admin
      .getByLabel("Doplnit Mladé ze Starých s oběma zařazeními")
      .isChecked(),
    true,
  );
  await admin.getByRole("button", { name: "Vygenerovat návrh" }).click();
  await admin.getByRole("button", { name: "Uložit a zveřejnit sadu" }).click();
  await admin.getByText("Páry jsou zveřejněné.", { exact: true }).waitFor();
  await go(
    member,
    "/udalosti/" + fixture.rehearsal,
    db.events.find((e) => e.id === fixture.rehearsal).title,
  );
  await member
    .getByRole("heading", { name: "Uložené sady párů", exact: true })
    .waitFor();
  await member.waitForFunction(
    () =>
      Array.from(document.querySelectorAll("h3")).filter((h) =>
        h.textContent?.includes("Zveřejněná"),
      ).length >= 3,
  );
  pass("Random rehearsal generator publishes an additional visible set");
  await go(admin, "/nastaveni", "Nastavení");
  await admin
    .getByRole("button", { name: "Písně a kategorie", exact: true })
    .click();
  await admin.getByLabel("Hledat píseň").fill("Trumpetří");
  assert.ok(
    (await admin.locator("main").innerText()).includes(
      "Dyž sem já mou milou ponyjprv vidíl / Trumpetří",
    ),
  );
  await admin
    .getByRole("button", { name: "Sezona a události", exact: true })
    .click();
  assert.equal(await admin.getByLabel("Typ sezóny").count(), 1);
  pass(
    "Settings include catalogue with compound song names and manual seasons",
  );
  await go(member, "/body", "Bodový přehled");
  await member.getByLabel("Období bodů").selectOption(fixture.carols);
  await member.getByLabel("Období bodů").selectOption("custom");
  await member.getByLabel("Body od").fill("2026-01-01");
  await member.getByLabel("Body do").fill("2026-12-31");
  const help = member.getByText("Jak se počítají body", { exact: true });
  await help.focus();
  await member.keyboard.press("Enter");
  assert.equal(await help.locator("..").getAttribute("open"), "");
  await noOverflow(member);
  pass("Everyone can filter season/date points and open Help with keyboard");
  const shared = await newPage(null, 390);
  await shared.goto(base);
  await shared.getByRole("tab", { name: "Kód souboru" }).click();
  await shared.getByLabel("Společný přístupový kód").fill(fixture.sharedCode);
  await shared.getByRole("button", { name: /Otevřít členský přehled/ }).click();
  await shared.locator(".app-layout").waitFor();
  await go(shared, route, title);
  await shared
    .getByRole("heading", { name: "Browser songs · Potvrzená" })
    .waitFor();
  assert.equal(
    await shared.getByRole("button", { name: "Upravit událost" }).count(),
    0,
  );
  await noOverflow(shared);
  pass(
    "Shared-code login sees published content without administrative controls",
  );
  await go(admin, route, title);
  await admin.setViewportSize({ width: 390, height: 844 });
  await noOverflow(admin);
  await admin.screenshot({
    path: screenshotDir + "/admin-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await admin.setViewportSize({ width: 1440, height: 1000 });
  await admin.screenshot({
    path: screenshotDir + "/admin-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  pass("Admin desktop and mobile visual checks");
  assert.deepEqual(errors, []);
  console.log(`Browser checks passed: ${checks}`);
} finally {
  await browser.close();
}
