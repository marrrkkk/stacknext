import { stackNextFixtures } from '@stacknext/playwright'

const { test, expect } = stackNextFixtures()

/**
 * Stable scenarios for StackNext baseline/candidate comparisons. The explicit
 * annotation is the identity source, so renaming a test title or moving the
 * file does not change the scenario id.
 */
test.describe('Example runtime scenarios', () => {
  test(
    'renders the example overview',
    { annotation: { type: 'stacknext.scenario', description: 'example.overview' } },
    async ({ page }) => {
      await page.goto('/')
      await expect(
        page.getByRole('heading', { name: 'A small app with real telemetry' }),
      ).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Open StackNext' })).toBeVisible()

      await page.goto('/scenarios')
      await page.getByRole('button', { name: 'Generate demo traffic' }).click()
      await expect(page.getByText('10/10 requests completed')).toBeVisible({ timeout: 30_000 })
    },
  )

  test(
    'renders a project with its tasks',
    { annotation: { type: 'stacknext.scenario', description: 'example.project-detail' } },
    async ({ page }, testInfo) => {
      await page.goto('/projects/1')
      await expect(page.getByRole('heading', { name: 'Launch website' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Add a task' })).toBeVisible()

      const title = `Playwright task ${Date.now()}-${testInfo.repeatEachIndex}`
      await page.getByLabel('Task title').fill(title)
      await page.getByRole('button', { name: 'Add task' }).click()

      const row = page.getByRole('row', { name: new RegExp(title) })
      await expect(row).toBeVisible()
      await expect(row.getByText('todo', { exact: true })).toBeVisible()

      await row.getByRole('button', { name: 'Move to doing' }).click()
      await expect(row.getByText('doing', { exact: true })).toBeVisible()
      await expect(row.getByRole('button', { name: 'Mark done' })).toBeVisible()
    },
  )

  test(
    'serves the N+1 query demo route',
    { annotation: { type: 'stacknext.scenario', description: 'example.n-plus-one' } },
    async ({ page }) => {
      await page.goto('/api/n-plus-one')
      await expect(page.locator('body')).toContainText('n-plus-one')
    },
  )
})
