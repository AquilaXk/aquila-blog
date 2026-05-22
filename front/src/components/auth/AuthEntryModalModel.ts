export type RsData<T> = {
  resultCode: string
  msg: string
  data: T
}

export type SignupEmailStartResult = {
  email: string
}

export type AuthModalView = "login" | "signup" | "signup-sent"

export type AuthEntryModalProps = {
  open: boolean
  onClose: () => void
  nextPath?: string
  title?: string
  description?: string
}

export const resolveAuthModalContent = (view: AuthModalView, loginTitle: string, loginDescription: string) => {
  if (view === "login") {
    return {
      heading: loginTitle,
      body: loginDescription,
    }
  }

  if (view === "signup") {
    return {
      heading: "회원가입",
      body: "",
    }
  }

  return {
    heading: "메일을 보냈어요",
    body: "받은편지함에서 메일을 열고 계속 진행해주세요.",
  }
}
