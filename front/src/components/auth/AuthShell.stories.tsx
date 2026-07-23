import type { Meta, StoryObj } from "@storybook/react"
import AuthShell from "./AuthShell"

const meta: Meta<typeof AuthShell> = {
  title: "Auth/AuthShell",
  component: AuthShell,
  tags: ["autodocs"],
  args: {
    activeTab: "login",
    eyebrow: "Auth",
    title: "로그인",
    subtitle: "운영 계정으로 접근해 작업을 이어갑니다.",
    heroTitle: "",
    footer: <>아직 회원이 아니신가요? 회원가입</>,
    children: (
      <form>
        <div style={{ display: "grid", gap: "0.45rem" }}>
          <label htmlFor="storybook-email">이메일</label>
          <input id="storybook-email" defaultValue="aquilaxk10@gmail.com" />
        </div>
        <div style={{ display: "grid", gap: "0.45rem" }}>
          <label htmlFor="storybook-password">비밀번호</label>
          <input id="storybook-password" type="password" defaultValue="134679258sS#" />
        </div>
        <button type="button">로그인</button>
      </form>
    ),
  },
}

export default meta

type Story = StoryObj<typeof AuthShell>

export const Login: Story = {}

export const Signup: Story = {
  args: {
    activeTab: "signup",
    title: "회원가입",
    subtitle: "이메일 인증 후 운영 기록을 구독하고 반응할 수 있습니다.",
    footer: <>이미 계정이 있으신가요? 로그인</>,
  },
}
