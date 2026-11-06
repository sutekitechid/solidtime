<?php

declare(strict_types=1);

namespace App\Enums;

use Datomatic\LaravelEnumHelper\LaravelEnumHelper;

enum Role: string
{
    use LaravelEnumHelper;

    case Owner = 'owner';
    case Admin = 'admin';
    case Manager = 'manager';
    case Employee = 'employee';
    case Placeholder = 'placeholder';

    /**
     * Whether a member with this role may stop a running timer
     * that belongs to a member with the given target role.
     *
     * Hierarchy (higher may stop lower or equal, except owner is protected):
     * - owner: may stop anyone (owner, admin, manager, employee, placeholder)
     * - admin: may stop admin, manager, employee, placeholder (not owner)
     * - manager: may stop manager, employee, placeholder (not admin/owner)
     * - employee/placeholder: may not stop anyone else (only own timer)
     *
     * Unknown or null target roles fail closed.
     */
    public function canStopTimerOfRole(?string $targetRole): bool
    {
        $target = $targetRole !== null ? self::tryFrom($targetRole) : null;
        if ($target === null) {
            return false;
        }

        return match ($this) {
            self::Owner => true,
            self::Admin => $target !== self::Owner,
            self::Manager => $target === self::Manager || $target === self::Employee || $target === self::Placeholder,
            default => false,
        };
    }

    /**
     * Whether the actor role may stop the target role's running timer.
     *
     * Unknown or null roles on either side fail closed. Callers must have
     * already checked the relevant time-entries:update permission; this only
     * enforces the additional role hierarchy for stopping someone else's timer.
     */
    public static function canStopTimer(?string $actorRole, ?string $targetRole): bool
    {
        $actor = $actorRole !== null ? self::tryFrom($actorRole) : null;
        if ($actor === null) {
            return false;
        }

        return $actor->canStopTimerOfRole($targetRole);
    }
}
