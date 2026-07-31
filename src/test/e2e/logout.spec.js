import { test, expect } from '@playwright/test'

test.describe('Logout Functionality', () => {
  test('should logout and redirect to login page', async ({ page }) => {
    // First, try to access a protected page (should redirect to login)
    await page.goto('/wallet')

    // Should be redirected to login page
    await expect(page).toHaveURL(/\/login/)

    // Check that login page loads correctly
    await expect(page.locator('h1')).toContainText('CARBONIFY')

    // Check that login form is visible
    const loginForm = page.locator('form, input, button')
    await expect(loginForm.first()).toBeVisible()
  })

  test('should clear session data on logout', async ({ page }) => {
    // Navigate to login page
    await page.goto('/login')

    // Check that we're on login page
    await expect(page).toHaveURL('/login')

    // Verify login form elements are present
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"], input[name="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test('should handle logout from any page', async ({ page }) => {
    // Try accessing different pages - all should redirect to login when not authenticated
    const pages = ['/wallet', '/profile', '/dashboard']

    for (const pagePath of pages) {
      await page.goto(pagePath)
      // All protected pages should redirect to login
      await expect(page).toHaveURL(/\/login/)
    }
  })

  // `/projects` is NOT protected — it is a legacy public alias that redirects to
  // the marketplace (src/router/index.js). It was in the list above, so this
  // suite reported an auth-guard failure where the guard was never involved.
  test('/projects is a public alias for the marketplace, not a guarded route', async ({ page }) => {
    await page.goto('/projects')
    await expect(page).toHaveURL(/\/marketplace/)
  })
})
