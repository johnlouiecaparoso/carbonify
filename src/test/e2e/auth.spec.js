import { test, expect } from '@playwright/test'

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('should display homepage with login/register buttons', async ({ page }) => {
    // Wait for the page to load completely
    await page.waitForLoadState('networkidle')

    await expect(page.locator('h1.hero-title')).toContainText(
      'Trade Carbon Credits with Confidence',
    )
    await expect(page.locator('button:has-text("Sign In")')).toBeVisible()
    await expect(page.locator('button:has-text("Sign Up")')).toBeVisible()
  })

  test('should navigate to login page', async ({ page }) => {
    await page.click('button:has-text("Sign In")')
    await expect(page).toHaveURL(/\/login/)
    await expect(page.locator('h2')).toContainText('Welcome back')
  })

  test('should navigate to register page', async ({ page }) => {
    // Wait for the page to load completely
    await page.waitForLoadState('networkidle')

    // Wait for the Sign Up button to be visible and clickable
    await page.waitForSelector('button:has-text("Sign Up")', { state: 'visible' })
    await page.click('button:has-text("Sign Up")')
    await expect(page).toHaveURL('/register')
    await expect(page.locator('h2')).toContainText('Create your account')
  })

  // Field-level validation renders through UiInput's `error` prop as
  // `.enhanced-input__error`; form/server-level errors render as
  // `.error-message`. There is no bare `.error` class — asserting on one is how
  // these three tests sat red without anyone noticing.
  test('should show validation errors for empty login form', async ({ page }) => {
    await page.goto('/login')
    await page.click('button[type="submit"]')

    await expect(page.locator('.enhanced-input__error').first()).toBeVisible()
    await expect(page.locator('.enhanced-input__error').first()).toContainText('required')
  })

  test('should show validation errors for invalid email', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[type="email"]', 'invalid-email')
    await page.fill('input[type="password"]', 'password123')
    await page.click('button[type="submit"]')

    await expect(page.locator('.enhanced-input__error').first()).toContainText(
      'Enter a valid email address',
    )
  })

  // Guards a DELIBERATE removal, so it asserts the absence of an error rather
  // than its presence. Sign-in used to demand 6 characters — a rule that can
  // only ever reject a *correct* password belonging to an older account.
  // Whether the password is right is the server's call, not the form's.
  // See the comment in src/components/auth/LoginForm.vue:validatePassword.
  test('should NOT reject a short password client-side on sign-in', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[type="email"]', 'test@example.com')
    await page.fill('input[type="password"]', '123')
    await page.click('button[type="submit"]')

    // The password field must never carry a length complaint. (The request goes
    // to the server; whatever it answers is not this test's business.)
    const passwordField = page.locator('.form-field').filter({ hasText: 'Password' })
    await expect(passwordField.locator('.enhanced-input__error')).toHaveCount(0)
  })

  // Client-side only: submitting a real registration would create an account on
  // whatever backend the build points at. Whether the backend ACCEPTS signups is
  // a separate, deliberately opt-in check — see pilot-readiness.spec.js.
  test('should reject a registration password under 8 characters', async ({ page }) => {
    await page.goto('/register')

    await page.fill('input[id="name"]', 'Test User')
    await page.fill('input[id="email"]', 'test@example.com')
    await page.fill('input[id="password"]', 'short1')
    await page.fill('input[id="confirm"]', 'short1')
    await page.click('button[type="submit"]')

    await expect(page.locator('.enhanced-input__error').first()).toContainText(
      'at least 8 characters',
    )
    // Client-side validation must stop the submit, not merely annotate it.
    await expect(page).toHaveURL(/\/register/)
  })

  test('should show password mismatch error', async ({ page }) => {
    await page.goto('/register')

    await page.fill('input[id="name"]', 'Test User')
    await page.fill('input[id="email"]', 'test@example.com')
    await page.fill('input[id="password"]', 'password123')
    await page.fill('input[id="confirm"]', 'different123')
    await page.click('button[type="submit"]')

    await expect(page.locator('.enhanced-input__error').first()).toContainText(
      'Passwords do not match',
    )
  })
})
