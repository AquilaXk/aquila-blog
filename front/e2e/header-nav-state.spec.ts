import { expect, test } from "@playwright/test"
import { readFileSync } from "fs"
import path from "path"

test("헤더 auth shell은 pre-paint bootstrap과 display-gated 슬롯을 유지한다", () => {
  const navBarSource = readFileSync(path.resolve(__dirname, "../src/layouts/RootLayout/Header/NavBar.tsx"), "utf8")
  const documentSource = readFileSync(path.resolve(__dirname, "../src/pages/_document.tsx"), "utf8")
  const headerAuthShellSource = readFileSync(path.resolve(__dirname, "../src/libs/headerAuthShell.ts"), "utf8")

  expect(documentSource).toContain("HEADER_AUTH_SHELL_BOOTSTRAP_SCRIPT")
  expect(documentSource).toContain('data-header-auth-shell="anonymous"')
  expect(headerAuthShellSource).toContain('window.sessionStorage.getItem(HEADER_AUTH_SHELL_STORAGE_KEY)')
  expect(headerAuthShellSource).toContain('document.documentElement.setAttribute(HEADER_AUTH_SHELL_ATTR, shell)')
  expect(navBarSource).toContain('className="navLink navAction--admin"')
  expect(navBarSource).toContain('className={loginButtonClassName}')
  expect(navBarSource).toContain('className="logoutBtn navAction--logout"')
  expect(navBarSource).toContain('.authSlot--login {\n    display: none;')
  expect(navBarSource).toContain('html[data-header-auth-shell="anonymous"] & .authSlot--login')
  expect(navBarSource).toContain('html[data-header-auth-shell="authenticated"] & .authSlot--logout')
  expect(navBarSource).not.toContain("const NavGhost")
})
