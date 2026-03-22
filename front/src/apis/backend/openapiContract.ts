import type { paths as BackendOpenApiPaths } from "@shared/contracts"

type PathKeys = Extract<keyof BackendOpenApiPaths, string>
type PathConstraint = PathKeys extends never ? string : PathKeys

export const asOpenApiPath = <P extends string>(path: P & PathConstraint) => path
