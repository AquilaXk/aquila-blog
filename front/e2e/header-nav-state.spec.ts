import { expect, test } from "@playwright/test"
import { readFileSync } from "fs"
import path from "path"

test("헤더 auth ghost placeholder는 텍스트 없이 폭만 예약한다", () => {
  const navBarSource = readFileSync(path.resolve(__dirname, "../src/layouts/RootLayout/Header/NavBar.tsx"), "utf8")

  expect(navBarSource).toContain("const NavGhost: React.FC")
  expect(navBarSource).toContain('aria-hidden="true"')
  expect(navBarSource).toContain('<NavGhost className="navGhost--fill" />')
  expect(navBarSource).toContain('<NavGhost className="navGhost--action" />')
  expect(navBarSource).not.toContain('<span className="navGhost">Admin</span>')
  expect(navBarSource).not.toContain('<span className="navGhost navGhost--action">Login</span>')
  expect(navBarSource).not.toContain('<span className="navGhost navGhost--action">Logout</span>')
})
