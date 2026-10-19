import { expect, test } from "@playwright/test";

const required = ["AKUVOX_HA_URL", "AKUVOX_HA_USERNAME", "AKUVOX_HA_PASSWORD"];
const missing = required.filter((name) => !process.env[name]);

test.describe("Akuvox panel smoke test", () => {
  test.skip(missing.length > 0, `Set ${missing.join(", ")} to run against a dedicated Home Assistant test instance.`);

  test("an administrator can load every non-destructive panel tab", async ({ page }) => {
    await page.goto(process.env.AKUVOX_HA_URL);
    await page.getByRole("textbox", { name: "Username" }).fill(process.env.AKUVOX_HA_USERNAME);
    await page.getByRole("textbox", { name: "Password" }).fill(process.env.AKUVOX_HA_PASSWORD);
    await page.getByRole("button", { name: /log in/i }).click();
    await page.waitForURL((url) => url.pathname === "/akuvox-smartplus", { timeout: 15_000 });

    await expect(page.locator("akuvox-smartplus-panel")).toBeVisible({ timeout: 15_000 });

    const panel = page.locator("akuvox-smartplus-panel");
    for (const tab of ["Devices", "Latest activity", "Call history", "Temporary keys", "Automations", "Settings", "Help & Info"]) {
      await panel.getByRole("button", { name: tab, exact: true }).click();
      await expect(panel).toContainText(tab);
    }
  });
});
