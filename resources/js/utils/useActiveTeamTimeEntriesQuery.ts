import { useQuery } from '@tanstack/vue-query';
import { api, type TimeEntry } from '@/packages/api/src';
import { getCurrentOrganizationId } from '@/utils/useUser';
import { computed } from 'vue';

const PAGE_LIMIT = 500;

async function fetchAllActiveEntries(organizationId: string): Promise<TimeEntry[]> {
    const allEntries: TimeEntry[] = [];
    let offset = 0;

    // Paginate through the whole result instead of silently truncating,
    // otherwise running timers beyond the first page would be invisible
    // and unstoppable.
    while (true) {
        const response = await api.getTimeEntries({
            params: { organization: organizationId },
            queries: {
                active: 'true',
                limit: PAGE_LIMIT,
                offset: offset || undefined,
            },
        });
        allEntries.push(...response.data);
        if (response.data.length < PAGE_LIMIT) {
            return allEntries;
        }
        offset += response.data.length;
    }
}

export function useActiveTeamTimeEntriesQuery() {
    const organizationId = computed(() => getCurrentOrganizationId());

    const query = useQuery({
        queryKey: computed(() => ['timeEntries', 'active-team', organizationId.value]),
        queryFn: async () => {
            const orgId = organizationId.value;
            if (!orgId) {
                return { data: [] as TimeEntry[] };
            }
            return { data: await fetchAllActiveEntries(orgId) };
        },
        enabled: computed(() => !!organizationId.value),
        staleTime: 1000 * 10,
        refetchInterval: 1000 * 30,
    });

    const activeEntries = computed(() => query.data.value?.data ?? []);

    return {
        ...query,
        activeEntries,
    };
}
