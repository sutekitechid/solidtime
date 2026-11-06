import { describe, expect, it } from 'vitest';
import { canStopTimeEntryForRole } from './permissions';

// Parity matrix with App\Enums\Role::canStopTimer() (tests/Unit/Enums/RoleTest.php).
// Both sides fail closed on unknown roles.
const cases: Array<[string | null | undefined, string, boolean, boolean]> = [
    // [actor, target, hasUpdateAll, expected]
    ['manager', 'manager', true, true],
    ['manager', 'employee', true, true],
    ['manager', 'placeholder', true, true],
    ['manager', 'admin', true, false],
    ['manager', 'owner', true, false],
    ['admin', 'admin', true, true],
    ['admin', 'manager', true, true],
    ['admin', 'employee', true, true],
    ['admin', 'placeholder', true, true],
    ['admin', 'owner', true, false],
    ['owner', 'owner', true, true],
    ['owner', 'admin', true, true],
    ['owner', 'manager', true, true],
    ['owner', 'employee', true, true],
    ['owner', 'placeholder', true, true],
    ['employee', 'employee', true, false],
    ['employee', 'manager', true, false],
    ['placeholder', 'employee', true, false],
    // Without update:all nobody may stop others' timers.
    ['owner', 'employee', false, false],
    ['admin', 'employee', false, false],
    ['manager', 'employee', false, false],
    // Unknown roles fail closed.
    ['custom-role', 'employee', true, false],
    ['manager', 'custom-role', true, false],
    ['manager', '', true, false],
    [undefined, 'employee', true, false],
    [null, 'employee', true, false],
];

describe('canStopTimeEntryForRole', () => {
    it.each(cases)(
        'actor=%s target=%s updateAll=%s => %s',
        (actor, target, hasUpdateAll, expected) => {
            expect(canStopTimeEntryForRole(actor, target, hasUpdateAll)).toBe(expected);
        }
    );
});
