import { test, expect, _electron as electron } from '@playwright/test';

test('login and logout focus stability test', async () => {
  // Launch the Electron application
  const electronApp = await electron.launch({
    args: ['.']
  });

  // Wait for the main window to open
  const window = await electronApp.firstWindow();

  // Selectors
  const logoutButton = window.locator('span:has-text("Cerrar Sesión")');
  const emailInput = window.locator('input[type="email"]');

  // Helper to perform logout using the custom modal
  const performLogout = async () => {
    // Click the sidebar logout button
    const sidebarLogoutButton = window.locator('button:has-text("Cerrar Sesión")').first();
    await sidebarLogoutButton.click();
    
    // Wait for the custom modal and click its "Cerrar Sesión" button
    await window.waitForTimeout(1000); // Wait for modal transition
    const modalConfirmButton = window.locator('div.fixed button:has-text("Cerrar Sesión")');
    await modalConfirmButton.click();
  };

  // Wait for either the dashboard logout button or the login input to appear
  await Promise.race([
    logoutButton.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {}),
    emailInput.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
  ]);

  const isLoggedIn = await logoutButton.isVisible();

  if (isLoggedIn) {
    console.log('[E2E Test] Already logged in. Proceeding to logout...');
    await window.waitForTimeout(1500); // Pause before logging out
    
    // Perform custom modal logout
    await performLogout();
    
    // Wait for login form to mount
    await expect(emailInput).toBeVisible({ timeout: 10000 });
    await window.waitForTimeout(1500); // Pause after logout
  } else {
    console.log('[E2E Test] Not logged in. Filling credentials and logging in first...');
    const passwordInput = window.locator('input[type="password"]');
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await window.waitForTimeout(1000); // Pause before clicking login

    // Click Iniciar Sesión (credentials are pre-filled in dev)
    const loginButton = window.locator('button:has-text("Iniciar Sesión")');
    await loginButton.click();

    // Wait for dashboard
    await expect(logoutButton).toBeVisible({ timeout: 15000 });
    console.log('[E2E Test] Logged in successfully. Waiting 2 seconds...');
    await window.waitForTimeout(2000); // Pause on dashboard

    // Perform custom modal logout
    await performLogout();

    // Wait for login form to mount
    await expect(emailInput).toBeVisible({ timeout: 10000 });
    await window.waitForTimeout(1500); // Pause after logout
  }

  // Verify the email input is focused and accepts keyboard input
  await expect(emailInput).toBeFocused();

  // Delete the pre-filled email and type a new one to verify visual caret and focus typing
  await emailInput.focus();
  await window.keyboard.press('Control+A');
  await window.keyboard.press('Backspace');
  await window.waitForTimeout(1000); // Pause after clearing input
  
  await window.keyboard.type('otro-usuario@correo.com');
  await window.waitForTimeout(2000); // Pause to see the typed email

  // Verify the new typed value is present
  await expect(emailInput).toHaveValue('otro-usuario@correo.com');

  // Close the app
  await electronApp.close();
});
