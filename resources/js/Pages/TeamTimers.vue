<script setup lang="ts">
import AppLayout from '@/Layouts/AppLayout.vue';
import MainContainer from '@/packages/ui/src/MainContainer.vue';
import PageTitle from '@/Components/Common/PageTitle.vue';
import LoadingSpinner from '@/packages/ui/src/LoadingSpinner.vue';
import { ClockIcon } from '@heroicons/vue/20/solid';
import { StopIcon } from '@heroicons/vue/20/solid';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useMembersQuery } from '@/utils/useMembersQuery';
import { useActiveTeamTimeEntriesQuery } from '@/utils/useActiveTeamTimeEntriesQuery';
import { useTimeEntriesMutations } from '@/utils/useTimeEntriesMutations';
import { useOrganizationQuery } from '@/utils/useOrganizationQuery';
import { canStopTimeEntryFor, canViewAllTimeEntries } from '@/utils/permissions';
import { getCurrentOrganizationId } from '@/utils/useUser';
import {
    formatHumanReadableDuration,
    getDayJsInstance,
    getLocalizedDayJs,
} from '@/packages/ui/src/utils/time';
import { SecondaryButton } from '@/packages/ui/src';
import type { Member } from '@/packages/api/src';
import dayjs from 'dayjs';

const { members } = useMembersQuery();
const { activeEntries, isLoading } = useActiveTeamTimeEntriesQuery();
const { updateTimeEntry } = useTimeEntriesMutations();
const { organization } = useOrganizationQuery(getCurrentOrganizationId()!);

const stoppingIds = ref<Set<string>>(new Set());

// TimeEntryResource has no member_id, only user_id — resolve members by user_id
// (same pattern as TimeEntryRow.vue).
const memberByUserId = computed(() => {
    const map = new Map<string, Member>();
    for (const member of members.value) {
        map.set(member.user_id, member);
    }
    return map;
});

function memberFor(userId: string): Member | undefined {
    return memberByUserId.value.get(userId);
}

function canStop(userId: string): boolean {
    const member = memberFor(userId);
    if (!member) {
        return false;
    }
    return canStopTimeEntryFor(member.role, member.id);
}

function formatStart(start: string): string {
    return getLocalizedDayJs(start).format('HH:mm');
}

function formatDate(start: string): string {
    return getLocalizedDayJs(start).format('DD MMM YYYY');
}

// Live ticking clock so the elapsed column updates every second
// (same pattern as CurrentSidebarTimer.vue).
const now = ref(dayjs());
let timerInterval: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
    timerInterval = setInterval(() => {
        now.value = dayjs();
    }, 1000);
});

onUnmounted(() => {
    if (timerInterval !== null) {
        clearInterval(timerInterval);
    }
});

function elapsed(start: string): string {
    const diff = now.value.diff(dayjs(start), 's');
    return formatHumanReadableDuration(
        Math.max(0, diff),
        organization.value?.interval_format ?? 'hours-minutes',
        organization.value?.number_format ?? 'point'
    );
}

async function stopEntry(entry: (typeof activeEntries.value)[number]) {
    stoppingIds.value.add(entry.id);
    try {
        // useTimeEntriesMutations already invalidates ['timeEntries'], which
        // covers the active-team query below it.
        await updateTimeEntry({
            ...entry,
            end: getDayJsInstance().utc().format(),
        });
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
            <div v-else-if="isLoading" class="flex justify-center items-center py-12">
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
                            <th class="py-2 pr-4 font-medium">Date</th>
                            <th class="py-2 pr-4 font-medium">Start</th>
                            <th class="py-2 pr-4 font-medium">Elapsed</th>
                            <th class="py-2 pr-4 font-medium text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr
                            v-for="entry in activeEntries"
                            :key="entry.id"
                            class="border-t border-default-background-separator">
                            <td class="py-2 pr-4 text-text-primary font-medium">
                                {{ memberFor(entry.user_id)?.name ?? 'Unknown member' }}
                            </td>
                            <td class="py-2 pr-4 text-text-secondary capitalize">
                                {{ memberFor(entry.user_id)?.role ?? '' }}
                            </td>
                            <td class="py-2 pr-4 text-text-secondary max-w-64 truncate">
                                {{ entry.description || '—' }}
                            </td>
                            <td class="py-2 pr-4 text-text-secondary whitespace-nowrap">
                                {{ formatDate(entry.start) }}
                            </td>
                            <td class="py-2 pr-4 text-text-secondary">
                                {{ formatStart(entry.start) }}
                            </td>
                            <td
                                class="py-2 pr-4 text-text-primary font-medium tabular-nums whitespace-nowrap">
                                {{ elapsed(entry.start) }}
                            </td>
                            <td class="py-2 text-right">
                                <SecondaryButton
                                    v-if="canStop(entry.user_id)"
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
