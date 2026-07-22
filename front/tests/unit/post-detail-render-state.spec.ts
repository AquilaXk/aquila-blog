import { expect, test } from "@playwright/test"
import { resolvePostDetailRenderState } from "../../src/routes/Detail/postDetailRenderState"

test("404 success(null) maps to not_found CustomError path", () => {
  expect(
    resolvePostDetailRenderState({
      isNotFound: true,
      isError: false,
      isPending: false,
      hasPost: false,
    }),
  ).toBe("not_found")
})

test("500 ApiError maps to error ErrorState path", () => {
  expect(
    resolvePostDetailRenderState({
      isNotFound: false,
      isError: true,
      isPending: false,
      hasPost: false,
    }),
  ).toBe("error")
})

test("network/timeout query error maps to error ErrorState path", () => {
  expect(
    resolvePostDetailRenderState({
      isNotFound: false,
      isError: true,
      isPending: false,
      hasPost: false,
    }),
  ).toBe("error")
})

test("pending recovery shell without post stays on loading", () => {
  expect(
    resolvePostDetailRenderState({
      isNotFound: false,
      isError: false,
      isPending: true,
      hasPost: false,
    }),
  ).toBe("loading")
})

test("ready post renders content even if not pending", () => {
  expect(
    resolvePostDetailRenderState({
      isNotFound: false,
      isError: false,
      isPending: false,
      hasPost: true,
    }),
  ).toBe("ready")
})
