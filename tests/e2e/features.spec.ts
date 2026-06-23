import { test, expect, type Page } from '@playwright/test'

/**
 * Interaction checks for the player-experience features: persistence/resume,
 * best-time recording, the how-to-play modal, and the touch number pad. Runs
 * against the production build served by playwright.config's preview server.
 */

async function openTab(page: Page, name: string): Promise<void> {
  await page.getByRole('tab', { name }).click()
}
async function pickDifficulty(page: Page, label: string): Promise<void> {
  await page.getByLabel('Difficulty').selectOption({ label })
}
function statValue(page: Page, label: string) {
  return page
    .locator('.statline')
    .filter({ has: page.locator('.label', { hasText: new RegExp(`^${label}$`) }) })
    .locator('.value')
}

async function solveViaHints(page: Page, boardSel: string): Promise<void> {
  await page.locator(boardSel).focus()
  const banner = page.locator('.banner.show')
  for (let i = 0; i < 300 && !(await banner.isVisible()); i++) await page.keyboard.press('h')
  await expect(banner).toBeVisible()
}

test('resumes the puzzle and restores the board after a reload', async ({ page }) => {
  await page.goto('/')
  await openTab(page, 'Sudoku')
  await expect(page.locator('.board.sudoku')).toBeVisible()
  const firstBlank = page.locator('.sudoku .scell:not(.given)').first()
  await firstBlank.click()
  await page.keyboard.press('5')
  await expect(firstBlank).toHaveText('5')
  const progressBefore = await statValue(page, 'Progress').textContent()

  await page.reload()

  // Session pointer resumes Sudoku; the saved board restores the entered digit.
  await expect(page.locator('.board.sudoku')).toBeVisible()
  await expect(page.locator('.sudoku .scell:not(.given)').first()).toHaveText('5')
  await expect(statValue(page, 'Progress')).toHaveText(progressBefore ?? '')
})

test('resumes the timer (not reset to 0) after a reload', async ({ page }) => {
  await page.goto('/')
  await openTab(page, 'Sudoku')
  await page.locator('.sudoku .scell:not(.given)').first().click()
  await page.keyboard.press('5')
  // Let the timer tick past a second, then reload — pagehide flushes elapsed time.
  await expect(statValue(page, 'Time')).not.toHaveText('0:00')
  await page.reload()
  await expect(page.locator('.board.sudoku')).toBeVisible()
  await expect(statValue(page, 'Time')).not.toHaveText('0:00')
})

test('records a best time and shows confetti on solving', async ({ page }) => {
  await page.goto('/')
  await openTab(page, 'Sokoban')
  await pickDifficulty(page, 'Easy')
  await expect(page.locator('.board.sokoban')).toBeVisible()
  await solveViaHints(page, '.board.sokoban')

  await expect(statValue(page, 'Best')).not.toHaveText('—')
  await expect(page.locator('.confetti-piece').first()).toBeAttached()
})

test('slitherlink solves via hints, records a best time, and shows confetti', async ({ page }) => {
  await page.goto('/')
  await openTab(page, 'Slitherlink')
  await pickDifficulty(page, 'Easy')
  await expect(page.locator('.board.slither')).toBeVisible()
  await page.locator('.board.slither').focus()
  const banner = page.locator('.banner.show')
  for (let i = 0; i < 200 && !(await banner.isVisible()); i++) await page.keyboard.press('h')
  await expect(banner).toBeVisible()
  await expect(statValue(page, 'Best')).not.toHaveText('—')
  await expect(page.locator('.confetti-piece').first()).toBeAttached()
})

test('opens and closes the how-to-play modal', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'How to play' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText(/how to play/i)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})

test.describe('touch', () => {
  // Emulate a coarse-pointer phone so the touch controls (pointer: coarse) show.
  test.use({ viewport: { width: 393, height: 851 }, hasTouch: true, isMobile: true })

  test('sudoku on-screen keypad places a digit', async ({ page }) => {
    await page.goto('/')
    await openTab(page, 'Sudoku')
    await expect(page.locator('.board.sudoku')).toBeVisible()
    await expect(page.locator('.keypad')).toBeVisible()
    const firstBlank = page.locator('.sudoku .scell:not(.given)').first()
    await firstBlank.click()
    await page.locator('.keypad-btn', { hasText: /^7$/ }).first().click()
    await expect(firstBlank).toHaveText('7')
  })

  test('nonogram fill/cross toggle is available', async ({ page }) => {
    await page.goto('/')
    await openTab(page, 'Nonogram')
    await expect(page.locator('.painttoggle')).toBeVisible()
    await page.getByRole('button', { name: 'Cross' }).click()
    await expect(page.getByRole('button', { name: 'Cross' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  test('slitherlink line/cross toggle is available', async ({ page }) => {
    await page.goto('/')
    await openTab(page, 'Slitherlink')
    await expect(page.locator('.board.slither')).toBeVisible()
    await expect(page.locator('.painttoggle')).toBeVisible()
    await page.getByRole('button', { name: 'Cross' }).click()
    await expect(page.getByRole('button', { name: 'Cross' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})
