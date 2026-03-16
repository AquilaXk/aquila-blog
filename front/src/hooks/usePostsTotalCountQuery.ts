import { useQuery, useQueryClient } from "@tanstack/react-query"
import { queryKey } from "src/constants/queryKey"

export const usePostsTotalCountQuery = () => {
  const queryClient = useQueryClient()
  const { data } = useQuery<number>({
    queryKey: queryKey.postsTotalCount(),
    queryFn: async () => queryClient.getQueryData<number>(queryKey.postsTotalCount()) ?? 0,
    enabled: false,
    initialData: () => queryClient.getQueryData<number>(queryKey.postsTotalCount()),
  })
  return typeof data === "number" && Number.isFinite(data) ? data : null
}
