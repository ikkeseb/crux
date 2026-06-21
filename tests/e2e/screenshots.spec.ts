import { test, expect, type Page } from '@playwright/test'

/**
 * Drives the real built app in Chromium: verifies each puzzle type renders and is
 * interactive, and captures screenshots into /screens. Run with `pnpm screens`
 * (the preview server is started automatically by playwright.config).
 */

async function pickDifficulty(page: Page, label: string): Promise<void> {
  await page.getByLabel('Difficulty').selectOption({ label })
}

async function openTab(page: Page, name: string): Promise<void> {
  await page.getByRole('tab', { name }).click()
}

test('renders and screenshots every puzzle type', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.board.nono')).toBeVisible()
  await expect(page.locator('.nono .cell').first()).toBeVisible()
  await page.waitForTimeout(150)
  await page.screenshot({ path: 'screens/nonogram.png' })

  // Nonogram, harder size.
  await pickDifficulty(page, 'Hard')
  await expect(page.locator('.board.nono')).toBeVisible()
  await page.waitForTimeout(150)
  await page.screenshot({ path: 'screens/nonogram-hard.png' })

  // Sudoku: enter a few digits to show entries + peer highlight.
  await openTab(page, 'Sudoku')
  await pickDifficulty(page, 'Medium')
  await expect(page.locator('.board.sudoku')).toBeVisible()
  const cells = page.locator('.sudoku .scell:not(.given)')
  await cells.first().click()
  await page.keyboard.press('5')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('7')
  await page.waitForTimeout(150)
  await page.screenshot({ path: 'screens/sudoku.png' })

  // Sokoban: render, then solve via repeated hints to show the win banner.
  await openTab(page, 'Sokoban')
  await pickDifficulty(page, 'Easy')
  await expect(page.locator('.board.sokoban')).toBeVisible()
  await expect(page.locator('.sokoban .player')).toBeVisible()
  await page.waitForTimeout(150)
  await page.screenshot({ path: 'screens/sokoban.png' })

  const banner = page.locator('.banner.show')
  await page.locator('.board.sokoban').focus()
  for (let i = 0; i < 250 && !(await banner.isVisible()); i++) {
    await page.keyboard.press('h')
  }
  await expect(banner).toBeVisible()
  await page.waitForTimeout(200)
  await page.screenshot({ path: 'screens/sokoban-solved.png' })

  // Slitherlink: render, then draw part of the loop via hints for a lively shot.
  await openTab(page, 'Slitherlink')
  await pickDifficulty(page, 'Easy')
  await expect(page.locator('.board.slither')).toBeVisible()
  await expect(page.locator('.slither .edge').first()).toBeVisible()
  await page.locator('.board.slither').focus()
  for (let i = 0; i < 8; i++) await page.keyboard.press('h')
  await page.waitForTimeout(150)
  await page.screenshot({ path: 'screens/slitherlink.png' })

  // Daily mode badge.
  await openTab(page, 'Nonogram')
  await pickDifficulty(page, 'Easy')
  await page.getByRole('button', { name: 'Daily' }).click()
  await expect(page.locator('.board.nono')).toBeVisible()
  await page.waitForTimeout(150)
  await page.screenshot({ path: 'screens/daily.png' })
})

test('undo after solving clears the win banner', async ({ page }) => {
  await page.goto('/')
  await openTab(page, 'Sokoban')
  await pickDifficulty(page, 'Easy')
  await expect(page.locator('.board.sokoban')).toBeVisible()
  await page.locator('.board.sokoban').focus()
  const banner = page.locator('.banner.show')
  for (let i = 0; i < 250 && !(await banner.isVisible()); i++) {
    await page.keyboard.press('h')
  }
  await expect(banner).toBeVisible()
  await page.keyboard.press('u') // undo back out of the solved state
  await expect(banner).toBeHidden()
})

test('keyboard hint marks a deduced nonogram cell', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.board.nono')).toBeVisible()
  // Focus without clicking a cell (a click would mark one and skew the count).
  await page.locator('.board.nono').focus()
  const marked = '.nono .cell.fill, .nono .cell.cross'
  expect(await page.locator(marked).count()).toBe(0)
  await page.keyboard.press('h')
  // A solver hint places a logically-forced cell — which may be a fill or a cross.
  await expect.poll(async () => page.locator(marked).count()).toBeGreaterThan(0)
})
