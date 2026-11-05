<script setup lang="ts">
import AppLayout from '@/Layouts/AppLayout.vue';
import MainContainer from '@/packages/ui/src/MainContainer.vue';
import PageTitle from '@/Components/Common/PageTitle.vue';
import LoadingSpinner from '@/packages/ui/src/LoadingSpinner.vue';
import { StopIcon } from '@heroicons/vue/20/solid';
import { ClockIcon } from '@heroicons/vue/20/solid';
import { computed, ref } from 'vue';
import { useMembersQuery } from '@/utils/useMembersQuery';
import { useActiveTeamTimeEntriesQuery } from '@/utils/useActiveTeamTimeEntriesQuery';
import { useTimeEntriesMutations } from '@/utils/useTimeEntriesMutations';
import { canStopTimeEntryFor, canViewAllTimeEntries } from '@/utils/permissions';
import { getCurrentMembershipId } from '@/utils/useUser';
import { getDayJsInstance, getLocalizedDayJs } from '@/packages/ui/src/utils/time';
import { SecondaryButton } from '@/packages/ui/src';

const { members } = useMembersQuery();
const { activeEntries, isPending, invalidateActiveTeamEntries } = useActiveTeamTimeEntriesQuery();
const { updateTimeEntry } = useTimeEntriesMutations();

const stoppingIds = ref<Set<string>>(new Set());

const memberById = computed(() => {
    const map = new Map<string, (typeof members.value)[number]>();
    for (const m of members.value) {
        map.set(m.id, m);
    }
    return map;
});

function memberName(memberId: string): string {
    return memberById.value.get(memberId)?.name ?? 'Unknown member';
}

function memberRole(memberId: string): string {
    return memberById.value.get(memberId)?.role ?? '';
}

function canStop(memberId: string): boolean {
    if (memberId === getCurrentMembershipId()) {
        return false;
    }
    return canStopTimeEntryFor(memberRole(memberId), memberId);
}

function formatStart(start: string): string {
    return getLocalizedDayJs(start).format('DD MMM YYYY HH:mm');
}

async function stopEntry(entry: (typeof activeEntries.value)[number]) {
    stoppingIds.value.add(entry.id);
    try {
        await updateTimeEntry({
            ...entry,
            end: getDayJsInstance().utc().format(),
        });
        await invalidateActiveTeamEntries();
    } finally {
        stoppingIds.value.delete(entry.id);
    }
}
</script>

<template>
    <AppLayout title="Team Timers" data-testid="team_timers_view">
        <MainContainer
            class="py-5 border-b border-default-background-separator flex justify-between items-center">
            <PageTitle :icon="ClockIcon" title="Team Timers" />
        </MainContainer>
        <MainContainer class="py-4">
            <div v-if="!canViewAllTimeEntries()" class="text-sm text-text-secondary">
                You do not have permission to view team timers.
            </div>
            <div v-else-if="isPending" class="flex justify-center items-center py-12">
                <LoadingSpinner />
            </div>
            <div v-else-if="activeEntries.length === 0" class="text-center pt-12">
                <StopIcon class="w-8 text-icon-default inline pb-2" />
                <h3 class="text-text-primary font-semibold">No running timers</h3>
                <p class="pb-5">No team member is currently tracking time.</p>
            </div>
            <div v-else class="overflow-x-auto">
                <table class="min-w-full text-sm" data-testid="team_timers_table">
                    <thead>
                        <tr class="text-left text-text-tertiary">
                            <th class="py-2 pr-4 font-medium">Member</th>
                            <th class="py-2 pr-4 font-medium">Role</th>
                            <th class="py-2 pr-4 font-medium">Description</th>
                            <th class="py-2 pr-4 font-medium">Start</th>
                            <th class="py-2 pr-4 font-medium text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr
                            v-for="entry in activeEntries"
                            :key="entry.id"
                            class="border-t border-default-background-separator">
                            <td class="py-2 pr-4 text-text-primary font-medium">
                                {{ memberName(entry.member_id) }}
                            </td>
                            <td class="py-2 pr-4 text-text-secondary capitalize">
                                {{ memberRole(entry.member_id) }}
                            </td>
                            <td class="py-2 pr-4 text-text-secondary max-w-64 truncate">
                                {{ entry.description || '—' }}
                            </td>
                            <td class="py-2 pr-4 text-text-secondary">
                                {{ formatStart(entry.start) }}
                            </td>
                            <td class="py-2 text-right">
                                <SecondaryButton
                                    v-if="canStop(entry.member_id)"
                                    size="small"
                                    :loading="stoppingIds.has(entry.id)"
                                    @click="stopEntry(entry)">
                                    Stop
                                </SecondaryButton>
                                <span v-else class="text-text-tertiary text-xs">—</span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </MainContainer>
    </AppLayout>
</template>
