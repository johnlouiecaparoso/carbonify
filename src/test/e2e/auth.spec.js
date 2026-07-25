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

  test('should show validation errors for empty login form', async ({ page }) => {
    await page.goto('/login')
    await page.click('button[type="submit"]')

    await expect(page.locator('.error').first()).toBeVisible()
  })

  test('should show validation errors for invalid email', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[type="email"]', 'invalid-email')
    await page.fill('input[type="password"]', 'password123')
    await page.click('button[type="submit"]')

    await expect(page.locator('.error').first()).toBeVisible()
  })

  test('should show validation errors for short password', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[type="email"]', 'test@example.com')
    await page.fill('input[type="password"]', '123')
    await page.click('button[type="submit"]')

    await expect(page.locator('.error').first()).toBeVisible()
  })

  test('should handle registration flow', async ({ page }) => {
    await page.goto('/register')

    await page.fill('input[id="name"]', 'Test User')
    await page.fill('input[id="email"]', 'test@example.com')
    await page.fill('input[id="password"]', 'password123')
    await page.fill('input[id="confirm"]', 'password123')
    await page.click('button[type="submit"]')

    // Wait a bit for the registration to complete
    await page.waitForTimeout(2000)
    
    // Check for any error messages
    const errorMessages = await page.locator('.error, [class*="error"]').allTextContents()
    console.log('Registration test - Error messages:', errorMessages)
    
    // Check for loading state
    const isLoading = await page.locator('button[type="submit"]:disabled').count()
    console.log('Registration test - Is loading:', isLoading > 0)
    
    // Check current URL and log it for debugging
    const currentUrl = page.url()
    console.log('Registration test - Current URL:', currentUrl)
    
    // Check if there are any validation errors
    const validationErrors = await page.locator('small[style*="color: #b00020"]').allTextContents()
    console.log('Registration test - Validation errors:', validationErrors)
    
    // Should redirect to login or show success message
    await expect(page).toHaveURL(/\/login/)
  })

  test('should show password mismatch error', async ({ page }) => {
    await page.goto('/register')

    await page.fill('input[id="name"]', 'Test User')
    await page.fill('input[id="email"]', 'test@example.com')
    await page.fill('input[id="password"]', 'password123')
    await page.fill('input[id="confirm"]', 'different123')
    await page.click('button[type="submit"]')

    await expect(page.locator('small')).toBeVisible()
  })
})
