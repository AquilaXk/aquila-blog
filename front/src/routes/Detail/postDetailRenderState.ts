export type PostDetailRenderState = "not_found" | "error" | "loading" | "ready"

export type PostDetailRenderStateInput = {
  isNotFound: boolean
  isError: boolean
  isPending: boolean
  hasPost: boolean
}

export const resolvePostDetailRenderState = ({
  isNotFound,
  isError,
  isPending,
  hasPost,
}: PostDetailRenderStateInput): PostDetailRenderState => {
  if (isNotFound) return "not_found"
  if (isError && !isNotFound) return "error"
  if (isPending && !hasPost) return "loading"
  if (!hasPost) return "not_found"
  return "ready"
}
