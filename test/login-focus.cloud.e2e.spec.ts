import { test, expect, _electron as electron } from '@playwright/test';

test('login and logout focus stability test', async () => {
  // Launch the Electron application
  const electronApp = await electron.launch({
    args: ['.']
  });

  // Wait for the main window to open
  const window = await electronApp.firstWindow();

  // Selectors
  const emailInput = window.locator('input[type="email"]');
  // The sidebar auto-collapses on narrow windows (<=1024px), which hides the
  // logout button. Its title-bar toggle exposes aria-label "Mostrar barra
  // lateral" only while the sidebar is hidden.
  const sidebarToggle = window.getByRole('button', { name: 'Mostrar barra lateral' });
  const sidebarLogoutButton = window.locator('aside button:has-text("Cerrar Sesión")').first();

  // Reveal the sidebar when it is collapsed, so the logout button is clickable.
  const openSidebarIfHidden = async () => {
    if (await sidebarToggle.isVisible().catch(() => false)) {
      await sidebarToggle.click();
      await expect(sidebarLogoutButton).toBeVisible({ timeout: 5000 });
    }
  };

  // Helper to perform logout using the custom confirm modal
  const performLogout = async () => {
    await openSidebarIfHidden();
    await sidebarLogoutButton.click();
    // Confirm modal (ConfirmModal renders a `div.fixed` overlay)
    const modalConfirmButton = window.locator('div.fixed button:has-text("Cerrar Sesión")');
    await expect(modalConfirmButton).toBeVisible({ timeout: 5000 });
    await modalConfirmButton.click();
  };

  // Wait until the app settles into either the login form or the app shell.
  await Promise.race([
    emailInput.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {}),
    sidebarToggle.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {}),
    sidebarLogoutButton.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {}),
  ]);

  // Determine login state by the login form, NOT the collapsible logout button:
  // on a narrow window the app can be fully logged in (e.g. on the sales module)
  // while the sidebar — and its logout button — is hidden.
  const isLoggedIn = !(await emailInput.isVisible().catch(() => false));

  if (isLoggedIn) {
    console.log('[E2E Test] Already logged in. Proceeding to logout...');
  } else {
    console.log('[E2E Test] Not logged in. Filling credentials and logging in first...');
    const passwordInput = window.locator('input[type="password"]');
    await expect(passwordInput).toBeVisible();

    // The packaged (production) build does not pre-fill credentials — only the
    // dev build does. Fill them explicitly from the same env vars the other
    // cloud specs use, so this test also works against the real backend build.
    const email = process.env.CYBERBISTRO_TEST_EMAIL || 'test@test.com';
    const password = process.env.CYBERBISTRO_TEST_PASSWORD || 'test123456';
    await emailInput.fill(email);
    await passwordInput.fill(password);

    // Click Iniciar Sesión
    await window.locator('button:has-text("Iniciar Sesión")').click();

    // Dashboard is mounted once the login form unmounts.
    await expect(emailInput).toBeHidden({ timeout: 15000 });
    console.log('[E2E Test] Logged in successfully.');
  }

  // Log out to return to the login screen.
  await performLogout();
  await expect(emailInput).toBeVisible({ timeout: 10000 });

  // --- The actual point of this test: focus stability after logout ---
  // On Electron/Windows the email input could lose character-input focus after
  // the previous view unmounts. Verify it is focused and accepts keyboard input.
  await expect(emailInput).toBeFocused();

  await emailInput.focus();
  await window.keyboard.press('Control+A');
  await window.keyboard.press('Backspace');
  await window.keyboard.type('otro-usuario@correo.com');

  // Verify the new typed value is present
  await expect(emailInput).toHaveValue('otro-usuario@correo.com');

  // Close the app
  await electronApp.close();
});
