<?php

declare(strict_types=1);

namespace Tests\Unit\Enums;

use App\Enums\Role;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

#[CoversClass(Role::class)]
class RoleTest extends TestCase
{
    /**
     * @return array<string, array{?string, ?string, bool}>
     */
    public static function stopTimerProvider(): array
    {
        return [
            // Manager may stop managers and employees (and placeholders), nothing above.
            'manager stops manager' => ['manager', 'manager', true],
            'manager stops employee' => ['manager', 'employee', true],
            'manager stops placeholder' => ['manager', 'placeholder', true],
            'manager stops admin' => ['manager', 'admin', false],
            'manager stops owner' => ['manager', 'owner', false],
            // Admin may stop everyone except owners.
            'admin stops admin' => ['admin', 'admin', true],
            'admin stops manager' => ['admin', 'manager', true],
            'admin stops employee' => ['admin', 'employee', true],
            'admin stops placeholder' => ['admin', 'placeholder', true],
            'admin stops owner' => ['admin', 'owner', false],
            // Owner may stop anyone.
            'owner stops owner' => ['owner', 'owner', true],
            'owner stops admin' => ['owner', 'admin', true],
            'owner stops manager' => ['owner', 'manager', true],
            'owner stops employee' => ['owner', 'employee', true],
            'owner stops placeholder' => ['owner', 'placeholder', true],
            // Employees and placeholders may not stop anyone else's timer.
            'employee stops employee' => ['employee', 'employee', false],
            'employee stops manager' => ['employee', 'manager', false],
            'placeholder stops employee' => ['placeholder', 'employee', false],
            // Unknown and null roles fail closed on both sides.
            'unknown actor stops employee' => ['custom-role', 'employee', false],
            'manager stops unknown target' => ['manager', 'custom-role', false],
            'owner stops unknown target' => ['owner', 'custom-role', false],
            'null actor stops employee' => [null, 'employee', false],
            'manager stops null target' => ['manager', null, false],
            'null actor stops null target' => [null, null, false],
        ];
    }

    #[DataProvider('stopTimerProvider')]
    public function test_can_stop_timer_follows_role_hierarchy(?string $actor, ?string $target, bool $expected): void
    {
        $this->assertSame($expected, Role::canStopTimer($actor, $target));
    }

    #[DataProvider('stopTimerProvider')]
    public function test_can_stop_timer_of_role_matches_static_helper(?string $actor, ?string $target, bool $expected): void
    {
        $role = $actor !== null ? Role::tryFrom($actor) : null;
        if ($role === null) {
            $this->assertFalse($expected);

            return;
        }
        $this->assertSame($expected, $role->canStopTimerOfRole($target));
    }
}
