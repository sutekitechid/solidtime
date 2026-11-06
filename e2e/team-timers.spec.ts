import { expect, test } from '../playwright/fixtures';
import { PLAYWRIGHT_BASE_URL } from '../playwright/config';
import type { Page } from '@playwright/test';
import { createRunningTimeEntryViaApi, setupTestContext } from './utils/api';

// Inviting members goes through mailpit, so these tests need more time.
test.describe.configure({ timeout: 90000 });

async function goToTeamTimersPage(page: Page) {
    await page.goto(PLAYWRIGHT_BASE_URL + '/team-timers');
    await expect(page.getByTestId('team_timers_view')).toBeVisible();
}

test('owner can stop employee running timer from team timers page', async ({
    page,
    ctx,
    employee,
}) => {
    const employeeCtx = {
        ...(await setupTestContext(employee.page)),
        orgId: ctx.orgId,
        memberId: employee.memberId,
    };
    await createRunningTimeEntryViaApi(employeeCtx, 'Employee running task');

    await goToTeamTimersPage(page);
    const row = page
        .getByTestId('team_timers_table')
        .getByRole('row')
        .filter({ hasText: 'Employee running task' });
    await expect(row).toBeVisible();
    await expect(row.getByText('Unknown member')).toHaveCount(0);
    await expect(row.getByRole('button', { name: 'Stop' })).toBeVisible();

    await row.getByRole('button', { name: 'Stop' }).click();
    await expect(page.getByText('No running timers')).toBeVisible();
});

test('admin sees owner running timer without stop button', async ({ ctx, admin }) => {
    await createRunningTimeEntryViaApi(ctx, 'Owner running task');

    await goToTeamTimersPage(admin.page);
    const row = admin.page
        .getByTestId('team_timers_table')
        .getByRole('row')
        .filter({ hasText: 'Owner running task' });
    await expect(row).toBeVisible();
    await expect(row.getByRole('button', { name: 'Stop' })).toHaveCount(0);
});

test('employee without view-all permission cannot use team timers', async ({ employee }) => {
    await employee.page.goto(PLAYWRIGHT_BASE_URL + '/team-timers');
    await expect(
        employee.page.getByText('You do not have permission to view team timers.')
    ).toBeVisible();
});
