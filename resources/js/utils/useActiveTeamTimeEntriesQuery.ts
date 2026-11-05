import { useQuery, useQueryClient } from '@tanstack/vue-query';
import { api } from '@/packages/api/src';
import { getCurrentOrganizationId } from '@/utils/useUser';
import { computed } from 'vue';

export function useActiveTeamTimeEntriesQuery() {
    const queryClient = useQueryClient();
    const organizationId = computed(() => getCurrentOrganizationId());

    const query = useQuery({
        queryKey: computed(() => ['timeEntries', 'active-team', organizationId.value]),
        queryFn: async () => {
            const orgId = organizationId.value;
            if (!orgId) {
                return { data: [] };
            }
            return await api.getTimeEntries({
                params: { organization: orgId },
                queries: {
                    active: 'true',
                    limit: 100,
                },
            });
        },
        enabled: computed(() => !!organizationId.value),
        staleTime: 1000 * 10,
        refetchInterval: 1000 * 30,
    });

    const activeEntries = computed(() => query.data.value?.data ?? []);

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ['timeEntries'] });
    };

    return {
        ...query,
        activeEntries,
        invalidateActiveTeamEntries: invalidate,
    };
}
