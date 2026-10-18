import { expect, test } from "@playwright/test";

const required = ["AKUVOX_HA_URL", "AKUVOX_HA_USERNAME", "AKUVOX_HA_PASSWORD"];
const missing = required.filter((name) => !process.env[name]);

test.describe("Akuvox panel smoke test", () => {
  test.skip(missing.length > 0, `Set ${missing.join(", ")} to run against a dedicated Home Assistant test instance.`);

  test("an administrator can load every non-destructive panel tab", async ({ page }) => {
    await page.goto(process.env.AKUVOX_HA_URL);
    await page.getByLabel(/username/i).fill(process.env.AKUVOX_HA_USERNAME);
    await page.getByLabel(/password/i).fill(process.env.AKUVOX_HA_PASSWORD);
    await page.getByRole("button", { name: /log in/i }).click();

    await page.goto(new URL("/akuvox-smartplus", process.env.AKUVOX_HA_URL).toString());
    await expect(page.locator("akuvox-smartplus-panel")).toBeVisible();

    const panel = page.locator("akuvox-smartplus-panel");
    for (const tab of ["Devices", "Latest Activity", "Call History", "Temporary Keys", "Automations", "Settings", "Help & Info"]) {
      await panel.getByRole("button", { name: tab, exact: true }).click();
      await expect(panel).toContainText(tab);
    }
  });
});
