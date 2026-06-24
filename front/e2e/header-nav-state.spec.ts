import { expect, test } from "@playwright/test"
import { readFileSync } from "fs"
import path from "path"

test("V4 헤더는 인증 상태별 Login/Admin/Logout 액션 계약을 유지한다", () => {
  const navBarSource = readFileSync(path.resolve(__dirname, "../src/layouts/RootLayout/Header/NavBar.tsx"), "utf8")

  expect(navBarSource).toContain("const { me, authStatus, logout } = useAuthSession()")
  expect(navBarSource).toContain('className="loginLink"')
  expect(navBarSource).toContain('className="adminLink"')
  expect(navBarSource).toContain('className="logoutBtn"')
  expect(navBarSource).toContain("await logout()")
  expect(navBarSource).toContain("toLoginPath(nextPath, fallbackPath)")
  expect(navBarSource).not.toContain("const NavGhost")
})
