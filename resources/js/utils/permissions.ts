import { usePage } from '@inertiajs/vue3';
import { getCurrentMembershipId, getCurrentRole } from '@/utils/useUser';

const page = usePage<{
    auth: {
        permissions: string[];
    };
}>();

function currentUserHasPermission(permission: string) {
    if (Array.isArray(page.props.auth.permissions)) {
        return page.props.auth.permissions.includes(permission);
    }
    return false;
}

export function canUpdateOrganization() {
    return currentUserHasPermission('organizations:update');
}

export function canViewProjects() {
    return currentUserHasPermission('projects:view');
}

export function canCreateProjects() {
    return currentUserHasPermission('projects:create');
}

export function canUpdateProjects() {
    return currentUserHasPermission('projects:update');
}

export function canDeleteProjects() {
    return currentUserHasPermission('projects:delete');
}

export function canViewProjectMembers() {
    return currentUserHasPermission('project-members:view');
}

export function canCreateTasks() {
    return currentUserHasPermission('tasks:create');
}

export function canUpdateTasks() {
    return currentUserHasPermission('tasks:update');
}

export function canDeleteTasks() {
    return currentUserHasPermission('tasks:delete');
}

export function canCreateClients() {
    return currentUserHasPermission('clients:create');
}

export function canUpdateClients() {
    return currentUserHasPermission('clients:update');
}

export function canDeleteClients() {
    return currentUserHasPermission('clients:delete');
}

export function canViewClients() {
    return currentUserHasPermission('clients:view');
}

export function canViewMembers() {
    return currentUserHasPermission('members:view');
}

export function canUpdateMembers() {
    return currentUserHasPermission('members:update');
}

export function canDeleteMembers() {
    return currentUserHasPermission('members:delete');
}

export function canMergeMembers() {
    return currentUserHasPermission('members:merge-into');
}

export function canMakeMembersPlaceholders() {
    return currentUserHasPermission('members:make-placeholder');
}

export function canInvitePlaceholderMembers() {
    return currentUserHasPermission('members:invite-placeholder');
}

export function canCreateInvitations() {
    return currentUserHasPermission('invitations:create');
}

export function canViewTags() {
    return currentUserHasPermission('tags:view');
}

export function canCreateTags() {
    return currentUserHasPermission('tags:create');
}

export function canUpdateTags() {
    return currentUserHasPermission('tags:update');
}

export function canDeleteTags() {
    return currentUserHasPermission('tags:delete');
}

export function canManageBilling() {
    return currentUserHasPermission('billing');
}

export function canViewReport() {
    return currentUserHasPermission('reports:view');
}
export function canUpdateReport() {
    return currentUserHasPermission('reports:update');
}
export function canDeleteReport() {
    return currentUserHasPermission('reports:delete');
}

export function canViewAllTimeEntries() {
    return currentUserHasPermission('time-entries:view:all');
}

export function canUpdateAllTimeEntries() {
    return currentUserHasPermission('time-entries:update:all');
}

/**
 * Whether the current user may stop a running timer of the given member.
 * Mirrors App\Enums\Role::canStopTimer() on the backend:
 * - owner: anyone, admin: not owner, manager: manager/employee/placeholder.
 * Own timer is always allowed (handled via update:own).
 */
export function canStopTimeEntryFor(targetRole: string, targetMemberId?: string): boolean {
    if (targetMemberId && targetMemberId === getCurrentMembershipId()) {
        return (
            currentUserHasPermission('time-entries:update:own') ||
            currentUserHasPermission('time-entries:update:all')
        );
    }
    if (!canUpdateAllTimeEntries()) {
        return false;
    }
    const actorRole = getCurrentRole() as string | undefined;
    if (!actorRole) {
        return false;
    }
    if (actorRole === 'owner') {
        return true;
    }
    if (actorRole === 'admin') {
        return targetRole !== 'owner';
    }
    if (actorRole === 'manager') {
        return targetRole === 'manager' || targetRole === 'employee' || targetRole === 'placeholder';
    }
    return false;
}
export function canViewInvoices() {
    return currentUserHasPermission('invoices:view');
}
export function canCreateReports() {
    return currentUserHasPermission('reports:create');
}

// Goal permissions are split by the type of goal they reach: `:own` covers the goals a member sets for
// themselves, `:organization-type` the organization goals of the team goals extension. The helpers without a
// suffix answer whether the member reaches at least one of the two, which is what the UI entry points need.
export function canViewOwnGoals() {
    return currentUserHasPermission('goals:view:own');
}
export function canViewOrganizationGoals() {
    return currentUserHasPermission('goals:view:organization-type');
}
export function canViewGoals() {
    return canViewOwnGoals() || canViewOrganizationGoals();
}
export function canCreateOwnGoals() {
    return currentUserHasPermission('goals:create:own');
}
export function canCreateOrganizationGoals() {
    return currentUserHasPermission('goals:create:organization-type');
}
export function canCreateGoals() {
    return canCreateOwnGoals() || canCreateOrganizationGoals();
}
export function canUpdateOwnGoals() {
    return currentUserHasPermission('goals:update:own');
}
export function canUpdateOrganizationGoals() {
    return currentUserHasPermission('goals:update:organization-type');
}
export function canUpdateGoals() {
    return canUpdateOwnGoals() || canUpdateOrganizationGoals();
}
export function canDeleteOwnGoals() {
    return currentUserHasPermission('goals:delete:own');
}
export function canDeleteOrganizationGoals() {
    return currentUserHasPermission('goals:delete:organization-type');
}
export function canDeleteGoals() {
    return canDeleteOwnGoals() || canDeleteOrganizationGoals();
}
