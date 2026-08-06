import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * WCAG regression gate. Scans the full page — every <details> expanded, every
 * tabbed panel revealed, animations neutralized — in both the dark (default)
 * and light themes. A green run here is what actually ships to Pages.
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function revealAll(page: Page): Promise<void> {
  // Open native disclosure widgets.
  await page.evaluate(() => {
    for (const details of Array.from(document.querySelectorAll('details'))) {
      (details as HTMLDetailsElement).open = true;
    }
    // Un-hide anything hidden by attribute so its contents are auditable.
    for (const el of Array.from(document.querySelectorAll('[hidden]'))) {
      el.removeAttribute('hidden');
    }
    for (const el of Array.from(document.querySelectorAll('[aria-hidden="true"]'))) {
      // Leave decorative shared-header/aria-hidden marquee elements alone only
      // if they carry no auditable content; safest is to reveal all so text
      // contrast is checked, matching what a user with a screen magnifier sees.
      el.removeAttribute('aria-hidden');
    }
  });

  // Exercise the Perfect/Approximate tab pair so both injected panels render.
  const tabs = page.locator('.he-tab');
  const tabCount = await tabs.count();
  for (let i = 0; i < tabCount; i++) {
    await tabs.nth(i).click();
  }
}

async function neutralizeMotion(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
}

async function scan(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 5),
  }));
  expect(summary).toEqual([]);
}

async function controlBorderContrast(page: Page): Promise<number> {
  return page.locator('.calc-row input').first().evaluate((el) => {
    const parse = (value: string) => value.match(/[\d.]+/g)!.slice(0, 3).map(Number);
    const luminance = (rgb: number[]) => {
      const linear = rgb.map((part) => {
        const channel = part / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    };
    const style = getComputedStyle(el);
    const border = luminance(parse(style.borderTopColor));
    const background = luminance(parse(style.backgroundColor));
    return (Math.max(border, background) + 0.05) / (Math.min(border, background) + 0.05);
  });
}

test('no WCAG A/AA violations in dark theme', async ({ page }) => {
  await page.goto('.');
  await expect(page.locator('h1')).toBeVisible();
  await revealAll(page);
  await neutralizeMotion(page);
  expect(await controlBorderContrast(page)).toBeGreaterThanOrEqual(3);
  await scan(page);
});

test('no WCAG A/AA violations in light theme', async ({ page }) => {
  await page.goto('.');
  await page.locator('#cl-theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('h1')).toBeVisible();
  await revealAll(page);
  await neutralizeMotion(page);
  expect(await controlBorderContrast(page)).toBeGreaterThanOrEqual(3);
  await scan(page);
});
