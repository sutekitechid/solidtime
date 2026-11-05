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
     */
    public function canStopTimerOfRole(string $targetRole): bool
    {
        $target = self::tryFrom($targetRole);
        if ($target === null) {
            // Unknown/custom roles: fall back to permission check only.
            return true;
        }

        return match ($this) {
            self::Owner => true,
            self::Admin => $target !== self::Owner,
            self::Manager => $target === self::Manager || $target === self::Employee || $target === self::Placeholder,
            default => false,
        };
    }

    public static function canStopTimer(string $actorRole, string $targetRole): bool
    {
        $actor = self::tryFrom($actorRole);
        if ($actor === null) {
            // Custom roles: rely on time-entries:update:all permission only.
            return true;
        }

        return $actor->canStopTimerOfRole($targetRole);
    }
}
