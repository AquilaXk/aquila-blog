import { getTextContent, getDateValue } from "notion-utils"
import { NotionAPI } from "notion-client"
import { Block, BlockMap, CollectionPropertySchemaMap } from "notion-types"
import { customMapImageUrl } from "./customMapImageUrl"
import { TPost } from "src/types"

export type NotionUser = {
  id?: string
  name?: string
  profile_photo?: string | null
}

type GetPagePropertiesOptions = {
  api?: NotionAPI
  userCache?: Map<string, NotionUser>
}

export type NotionPageProperties = Partial<TPost> &
  Record<string, unknown> & {
    id: string
  }

type UnknownRecord = Record<string, unknown>

const unwrapRecordValue = <T,>(raw: unknown): T | undefined => {
  if (!raw || typeof raw !== "object") return undefined
  const level1 = (raw as UnknownRecord).value
  if (level1 && typeof level1 === "object") {
    const level2 = (level1 as UnknownRecord).value
    if (level2 !== undefined) return level2 as T
    return level1 as T
  }
  return raw as T
}

type NotionUserValue = {
  id?: string
  name?: string
  family_name?: string
  given_name?: string
  profile_photo?: string | null
}

type GetUsersResponse = {
  recordMapWithRoles?: {
    notion_user?: Record<string, { value?: NotionUserValue }>
  }
}

const SPECIAL_PROPERTY_TYPES = new Set([
  "date",
  "select",
  "multi_select",
  "person",
  "file",
])

const parseFileProperty = (
  rawValue: unknown,
  rawBlock: unknown,
  fallbackBlock: Block
) => {
  try {
    const fileBlock = unwrapRecordValue<Block>(rawBlock) || fallbackBlock
    const rawFile = rawValue as unknown[]
    const url = ((rawFile[0] as unknown[])[1] as unknown[])[0] as unknown[]
    const fileUrl = String(url[1] || "")
    return customMapImageUrl(fileUrl, fileBlock)
  } catch {
    return undefined
  }
}

const parseDateProperty = (rawValue: unknown) => {
  const parsedDate = getDateValue(rawValue as never)
  if (!parsedDate || typeof parsedDate !== "object") return undefined
  const dateProperty = {
    ...(parsedDate as unknown as Record<string, unknown>),
  }
  delete dateProperty.type
  return dateProperty
}

const parseSelectProperty = (rawValue: unknown) => {
  const selects = getTextContent(rawValue as never)
  return selects ? selects.split(",") : []
}

const parsePersonProperty = async (
  rawValue: unknown,
  api: NotionAPI,
  userCache: Map<string, NotionUser>
) => {
  const rawUsers = (rawValue as unknown[]).flat()
  const userIds = rawUsers
    .map((rawUser) =>
      Array.isArray((rawUser as unknown[])[0])
        ? ((rawUser as unknown[])[0] as unknown[])[1]
        : undefined
    )
    .filter((userId): userId is string => typeof userId === "string")

  const users = await Promise.all(
    userIds.map(async (userId) => {
      const cachedUser = userCache.get(userId)
      if (cachedUser) return cachedUser

      const res = (await api.getUsers([userId])) as GetUsersResponse
      const resValue = res?.recordMapWithRoles?.notion_user?.[userId]?.value
      const user = {
        id: resValue?.id,
        name:
          resValue?.name ||
          `${resValue?.family_name}${resValue?.given_name}` ||
          undefined,
        profile_photo: resValue?.profile_photo || null,
      }
      userCache.set(userId, user)
      return user
    })
  )

  return users
}

async function getPageProperties(
  id: string,
  block: BlockMap,
  schema: CollectionPropertySchemaMap,
  options: GetPagePropertiesOptions = {}
): Promise<NotionPageProperties> {
  const api = options.api ?? new NotionAPI()
  const userCache = options.userCache ?? new Map<string, NotionUser>()

  // 1. 데이터 포장지 벗기기
  const rawBlock = block?.[id]
  const blockValue = unwrapRecordValue<Block>(rawBlock)

  if (!blockValue || !blockValue.properties || !schema) {
    return { id }
  }

  const rawProperties = blockValue.properties
  const properties: NotionPageProperties = { id }

  // 2. 스키마 매핑
  for (const key of Object.keys(schema)) {
    try {
      const propertySchema = schema[key]
      const propertyName = propertySchema.name
      const propertyType = propertySchema.type
      const rawValue = rawProperties[key]

      if (!rawValue) continue

      if (propertyType && !SPECIAL_PROPERTY_TYPES.has(propertyType)) {
        properties[propertyName] = getTextContent(rawValue)
      } else {
        switch (propertyType) {
          case "file": {
            properties[propertyName] = parseFileProperty(
              rawValue,
              rawBlock,
              blockValue
            )
            break
          }
          case "date": {
            properties[propertyName] = parseDateProperty(rawValue)
            break
          }
          case "select":
          case "multi_select": {
            properties[propertyName] = parseSelectProperty(rawValue)
            break
          }
          case "person": {
            properties[propertyName] = await parsePersonProperty(
              rawValue,
              api,
              userCache
            )
            break
          }
          default:
            break
        }
      }
    } catch (error) {
      continue
    }
  }
  return properties
}

export { getPageProperties as default }
