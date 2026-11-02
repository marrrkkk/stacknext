import { stackNextFixtures } from '@stacknext/playwright'

const { test, expect } = stackNextFixtures()

/**
 * Stable scenarios for StackNext baseline/candidate comparisons. The explicit
 * annotation is the identity source, so renaming a test title or moving the
 * file does not change the scenario id.
 */
test.describe('Tasklight runtime scenarios', () => {
  test(
    'renders the project overview',
    { annotation: { type: 'stacknext.scenario', description: 'tasklight.overview' } },
    async ({ page }) => {
      await page.goto('/')
      await expect(
        page.getByRole('heading', { name: 'Small app, real telemetry.' }),
      ).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible()
    },
  )

  test(
    'renders a project with its tasks',
    { annotation: { type: 'stacknext.scenario', description: 'tasklight.project-detail' } },
    async ({ page }) => {
      await page.goto('/projects/1')
      await expect(page.getByRole('heading', { name: 'Launch website' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible()
    },
  )

  test(
    'serves the N+1 query demo route',
    { annotation: { type: 'stacknext.scenario', description: 'tasklight.n-plus-one' } },
    async ({ page }) => {
      await page.goto('/api/n-plus-one')
      await expect(page.locator('body')).toContainText('n-plus-one')
    },
  )
})
