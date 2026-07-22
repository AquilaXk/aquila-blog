import { expect, test } from "@playwright/test"
import {
  buildExploreCursorPath,
  buildFeedCursorPath,
  buildFeedPath,
} from "../../src/apis/backend/posts/PostApiRequestModel"
import { queryKey } from "../../src/constants/queryKey"
import {
  FEED_SORT_OPTIONS,
  feedSortOptionId,
  resolveFeedSortListboxKeyDown,
  resolveFeedSortTriggerKeyDown,
  toFeedApiSortParam,
} from "../../src/routes/Feed/FeedSortMenuModel"

test.describe("feed server sort params", () => {
  test("maps sortMode to HIT_COUNT/LIKES_COUNT API sort values", () => {
    expect(toFeedApiSortParam("latest", "desc")).toBe("CREATED_AT")
    expect(toFeedApiSortParam("latest", "asc")).toBe("CREATED_AT_ASC")
    expect(toFeedApiSortParam("views")).toBe("HIT_COUNT")
    expect(toFeedApiSortParam("likes")).toBe("LIKES_COUNT")
  })

  test("feed/explore builders put server sort in query string", () => {
    expect(buildFeedCursorPath({ sortMode: "views", pageSize: 24 })).toBe(
      "/post/api/v1/posts/feed/cursor?sort=HIT_COUNT&pageSize=24"
    )
    expect(buildFeedPath({ sortMode: "likes", page: 2, pageSize: 10 })).toBe(
      "/post/api/v1/posts/feed?sort=LIKES_COUNT&page=2&pageSize=10"
    )
    expect(buildExploreCursorPath({ tag: "Kotlin", sortMode: "views", pageSize: 12 })).toBe(
      "/post/api/v1/posts/explore/cursor?tag=Kotlin&sort=HIT_COUNT&pageSize=12"
    )
  })

  test("infinite query keys include sortMode so views/likes skip latest SSR cache", () => {
    const latestKey = queryKey.postsFeedInfinite({ pageSize: 24, order: "desc", sortMode: "latest" })
    const viewsKey = queryKey.postsFeedInfinite({ pageSize: 24, order: "desc", sortMode: "views" })
    expect(latestKey[3]).toMatchObject({ sortMode: "latest" })
    expect(viewsKey[3]).toMatchObject({ sortMode: "views" })
    expect(JSON.stringify(latestKey)).not.toBe(JSON.stringify(viewsKey))
  })
})

test.describe("feed sort dropdown keyboard model", () => {
  test("trigger Enter/Space/ArrowDown opens with first option active", () => {
    expect(resolveFeedSortTriggerKeyDown("Enter", FEED_SORT_OPTIONS.length)).toEqual({
      type: "open",
      activeIndex: 0,
    })
    expect(resolveFeedSortTriggerKeyDown(" ", FEED_SORT_OPTIONS.length)).toEqual({
      type: "open",
      activeIndex: 0,
    })
    expect(resolveFeedSortTriggerKeyDown("ArrowDown", FEED_SORT_OPTIONS.length)).toEqual({
      type: "open",
      activeIndex: 0,
    })
  })

  test("listbox arrows move, Enter selects, Escape closes", () => {
    expect(resolveFeedSortListboxKeyDown("ArrowDown", 0, FEED_SORT_OPTIONS)).toEqual({
      type: "move",
      activeIndex: 1,
    })
    expect(resolveFeedSortListboxKeyDown("ArrowUp", 1, FEED_SORT_OPTIONS)).toEqual({
      type: "move",
      activeIndex: 0,
    })
    expect(resolveFeedSortListboxKeyDown("Enter", 2, FEED_SORT_OPTIONS)).toEqual({
      type: "select",
      value: "likes",
    })
    expect(resolveFeedSortListboxKeyDown("Escape", 1, FEED_SORT_OPTIONS)).toEqual({
      type: "close",
    })
    expect(feedSortOptionId("views")).toBe("feed-sort-option-views")
  })
})
