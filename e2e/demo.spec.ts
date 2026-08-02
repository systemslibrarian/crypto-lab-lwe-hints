import { expect, test, type Page } from '@playwright/test';

/**
 * Functional gate for the three exhibits that turn this page from an estimator
 * into something that runs: the concrete secret recovery, the measured GAA, and
 * the learner-supplied leakage profile.
 *
 * Assertions read values the browser computed during the run and check them
 * against each other — the hint counts must add up, the sweep must be monotone,
 * the KS statistic must agree with its own verdict, the profile crossing must
 * match the numbers printed beside it. Each success path is asserted next to the
 * failure path that keeps it honest.
 */

async function gotoLab(page: Page): Promise<void> {
  await page.goto('.');
  await expect(page.locator('#attack')).toBeVisible();
}

const digits = (s: string | null): number =>
  Number((s ?? '').replace(/[^\d.]/g, '').split('.')[0] || '0');

test.describe('the attack, actually run', () => {
  test('recovers the planted secret and the LWE instance confirms it', async ({ page }) => {
    await gotoLab(page);

    // It runs on load — the section is never an empty promise.
    await expect(page.locator('#atk-verdict')).toContainText('SECRET RECOVERED');
    await expect(page.locator('#atk-verdict')).toHaveClass(/recoverable/);

    await expect(page.locator('#atk-instance')).toContainText('n = 512');
    await expect(page.locator('#atk-instance')).toContainText('q = 3329');
    await expect(page.locator('#atk-support')).toContainText(
      'matching the planted support exactly',
    );
    await expect(page.locator('#atk-match')).toContainText('identical in all 512 coordinates');

    // The recovered secret explains the samples; a different one does not.
    const residual = (await page.locator('#atk-residual').textContent()) ?? '';
    expect(residual).toContain('so every sample is explained');
    const residualValue = Number((residual.match(/= (\d+)/) ?? [])[1]);
    expect(residualValue).toBeLessThanOrEqual(2);

    const control = (await page.locator('#atk-control').textContent()) ?? '';
    expect(control).toContain('rejected, as it must be');
    const controlValue = digits((control.match(/= ([\d,]+)/) ?? [])[1]);
    expect(controlValue).toBeGreaterThan(200);
  });

  test('the hint accounting adds up and beats the prior threshold', async ({ page }) => {
    await gotoLab(page);

    const support = digits((await page.locator('#atk-support').textContent())?.match(/^(\d+)/)?.[1] ?? '');
    const values = digits((await page.locator('#atk-values').textContent())?.match(/^(\d+)/)?.[1] ?? '');
    const totalText = (await page.locator('#atk-total').textContent()) ?? '';
    const total = digits(totalText.match(/^([\d,]+)/)?.[1] ?? '');

    expect(support).toBeGreaterThan(0);
    expect(values).toBeGreaterThan(0);
    expect(support + values).toBe(total);
    // n = 512, so the prior threshold is 256 and the run must be well under it.
    expect(totalText).toContain('n/2 = 256');
    expect(total).toBeLessThan(256);
    // Locating the support is the expensive half — that is the whole lesson.
    expect(support).toBeGreaterThan(values);
  });

  test('a different seed gives a different instance and still recovers', async ({ page }) => {
    await gotoLab(page);
    const first = await page.locator('#atk-instance').textContent();

    await page.locator('#atk-seed').fill('987654');
    await page.locator('#atk-seed').blur();
    await expect(page.locator('#atk-instance')).toContainText('seed 987654');
    expect(await page.locator('#atk-instance').textContent()).not.toBe(first);
    await expect(page.locator('#atk-verdict')).toContainText('SECRET RECOVERED');
  });

  test('the sweep shows cost climbing with h while n/2 stays put', async ({ page }) => {
    await gotoLab(page);
    await page.locator('#atk-sweep-run').click();

    const rows = page.locator('#atk-sweep-body tr');
    await expect(rows).toHaveCount(5);

    const totals: number[] = [];
    const priors = new Set<string>();
    for (let i = 0; i < 5; i += 1) {
      const cells = rows.nth(i).locator('td');
      totals.push(digits(await cells.nth(3).textContent()));
      priors.add(((await cells.nth(5).textContent()) ?? '').trim());
      // Every row must actually have recovered its secret.
      await expect(cells.nth(6), `row ${i}`).toHaveText('yes');
    }
    for (let i = 1; i < totals.length; i += 1) {
      expect(totals[i], `row ${i} total ${totals[i]} vs ${totals[i - 1]}`).toBeGreaterThan(
        totals[i - 1],
      );
    }
    // The prior baseline depends only on n, so it is identical down the column.
    expect(priors.size).toBe(1);
  });

  test('changing n changes the instance that is attacked', async ({ page }) => {
    await gotoLab(page);
    await page.locator('#atk-n').selectOption('1024');
    await expect(page.locator('#atk-instance')).toContainText('n = 1024');
    await expect(page.locator('#atk-total')).toContainText('n/2 = 512');
    await expect(page.locator('#atk-verdict')).toContainText('SECRET RECOVERED');
    await expect(page.locator('#atk-match')).toContainText('all 1,024 coordinates');
  });
});

test.describe('the GAA, measured', () => {
  test('is not rejected at the Hamming weight the paper anchors on', async ({ page }) => {
    await gotoLab(page);

    await expect(page.locator('#gaa-verdict')).toContainText('not rejected at h = 32');
    await expect(page.locator('#gaa-verdict')).toHaveClass(/recoverable/);

    // The verdict must agree with the two numbers printed above it.
    const ks = Number(await page.locator('#gaa-ks').textContent());
    const crit = Number(((await page.locator('#gaa-crit').textContent()) ?? '').split(' ')[0]);
    expect(ks).toBeGreaterThan(0);
    expect(ks).toBeLessThan(crit);

    // And the predicted spread must be sqrt(h * 24) = sqrt(768) = 27.71, with
    // the measured one landing close to it — predicted from h alone, not fitted.
    const predicted = Number(
      ((await page.locator('#gaa-predicted').textContent()) ?? '').split(' ')[0],
    );
    const measured = Number(
      ((await page.locator('#gaa-sd').textContent()) ?? '').split(' ')[0],
    );
    expect(predicted).toBeCloseTo(Math.sqrt(32 * 24), 1);
    expect(Math.abs(measured / predicted - 1)).toBeLessThan(0.05);
  });

  test('IS rejected at h = 1, where the assumption genuinely fails', async ({ page }) => {
    await gotoLab(page);
    await page.locator('[data-gaa-h="1"]').click();
    await expect(page.locator('[data-gaa-h="1"]')).toHaveAttribute('aria-pressed', 'true');

    await expect(page.locator('#gaa-verdict')).toContainText('REJECTED at h = 1');
    await expect(page.locator('#gaa-verdict')).toHaveClass(/not-yet/);

    const ks = Number(await page.locator('#gaa-ks').textContent());
    const crit = Number(((await page.locator('#gaa-crit').textContent()) ?? '').split(' ')[0]);
    expect(ks).toBeGreaterThan(crit);
    // Not marginal: a flat distribution is nothing like a bell.
    expect(ks).toBeGreaterThan(2 * crit);
  });

  test('the fit tightens as h grows', async ({ page }) => {
    await gotoLab(page);
    const ksAt = async (h: number): Promise<number> => {
      await page.locator(`[data-gaa-h="${h}"]`).click();
      return Number(await page.locator('#gaa-ks').textContent());
    };
    const one = await ksAt(1);
    const two = await ksAt(2);
    const eight = await ksAt(8);
    expect(two).toBeLessThan(one);
    expect(eight).toBeLessThan(two);
  });

  test('the predicted spread scales with sqrt(h)', async ({ page }) => {
    await gotoLab(page);
    const predictedAt = async (h: number): Promise<number> => {
      await page.locator(`[data-gaa-h="${h}"]`).click();
      return Number(((await page.locator('#gaa-predicted').textContent()) ?? '').split(' ')[0]);
    };
    const p8 = await predictedAt(8);
    const p32 = await predictedAt(32);
    // Four times the weight is twice the spread.
    expect(p32 / p8).toBeCloseTo(2, 2);
  });
});

test.describe('the learner’s own leakage profile', () => {
  test('accepts a pasted profile and finds the crossing period', async ({ page }) => {
    await gotoLab(page);

    await page.locator('#profile-input').fill('100\n100\n100\n100');
    await expect(page.locator('#profile-periods')).toHaveText('4');
    await expect(page.locator('#profile-total')).toHaveText('400');
    // Default regime is h = 32, so the threshold is 2*32*log2(32) = 320.
    await expect(page.locator('#profile-threshold')).toContainText('320');
    await expect(page.locator('#profile-verdict')).toContainText('Budget crossed at period 4');
    await expect(page.locator('#profile-verdict')).toHaveClass(/recoverable/);
  });

  test('reports a profile that never crosses as never crossing', async ({ page }) => {
    await gotoLab(page);
    await page.locator('#profile-input').fill('5\n5\n5\n5\n5');
    await expect(page.locator('#profile-verdict')).toContainText('Never crossed');
    await expect(page.locator('#profile-verdict')).toContainText('short by 295');
    await expect(page.locator('#profile-verdict')).toHaveClass(/not-yet/);
  });

  test('a burst crosses a budget a flat rate would not', async ({ page }) => {
    await gotoLab(page);
    await page.locator('#profile-input').fill('2\n2\n400\n2');
    await expect(page.locator('#profile-peak')).toContainText('400 in period 3');
    await expect(page.locator('#profile-verdict')).toContainText('Budget crossed at period 3');
  });

  test('reports unreadable lines instead of treating them as zero', async ({ page }) => {
    await gotoLab(page);
    await page.locator('#profile-input').fill('10\nlots\n20\n-3\n# a comment\n30');
    const errors = page.locator('#profile-errors');
    await expect(errors).toContainText('2 lines could not be read');
    await expect(errors).toContainText('not a number');
    await expect(errors).toContainText('negative');
    // The readable values still count: 10 + 20 + 30.
    await expect(page.locator('#profile-total')).toHaveText('60');
    await expect(page.locator('#profile-periods')).toHaveText('3');
  });

  test('keeps labels and honours comments and separators', async ({ page }) => {
    await gotoLab(page);
    await page.locator('#profile-input').fill('# campaign\nday one: 400\nday two: 5, 5');
    await expect(page.locator('#profile-periods')).toHaveText('3');
    await expect(page.locator('#profile-total')).toHaveText('410');
    await expect(page.locator('#profile-verdict')).toContainText('day one');
  });

  test('moving h moves the line the profile has to cross', async ({ page }) => {
    await gotoLab(page);
    await page.locator('#profile-input').fill('100\n100\n100\n100');
    await expect(page.locator('#profile-verdict')).toContainText('Budget crossed');

    // Raise h and the threshold climbs past the same profile's total.
    await page.locator('#h-slider').fill('128');
    await expect(page.locator('#profile-threshold')).toContainText('1,792');
    await expect(page.locator('#profile-verdict')).toContainText('Never crossed');

    // Drop it back down and the same profile crosses again.
    await page.locator('#h-slider').fill('32');
    await expect(page.locator('#profile-threshold')).toContainText('320');
    await expect(page.locator('#profile-verdict')).toContainText('Budget crossed');
  });

  test('a starting profile fills the box rather than replacing the box', async ({ page }) => {
    await gotoLab(page);
    const preset = page.locator('#profile-presets button').first();
    await preset.click();
    const filled = await page.locator('#profile-input').inputValue();
    expect(filled).toContain('day 1');
    // Still editable: the presets are a starting point, not the only option.
    await page.locator('#profile-input').fill(`${filled}\nday 8: 900`);
    await expect(page.locator('#profile-peak')).toContainText('900');
  });
});
