import type { IconName } from "src/components/icons/AppIcon"

export type ProfileCardLinkItem = {
  icon: IconName
  label: string
  href: string
}

export type ProfileCardLinkSection = "service" | "contact"

export const DEFAULT_SERVICE_ITEM_ICON: IconName = "service"
export const DEFAULT_CONTACT_ITEM_ICON: IconName = "message"

export const PROFILE_CARD_ICON_OPTIONS: { id: IconName; label: string }[] = [
  { id: "service", label: "서비스" },
  { id: "briefcase", label: "업무" },
  { id: "laptop", label: "개발" },
  { id: "rocket", label: "프로젝트" },
  { id: "spark", label: "하이라이트" },
  { id: "github", label: "GitHub" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "mail", label: "이메일" },
  { id: "message", label: "메시지" },
  { id: "kakao", label: "카카오" },
  { id: "instagram", label: "인스타그램" },
  { id: "globe", label: "웹사이트" },
  { id: "link", label: "링크" },
  { id: "phone", label: "전화" },
  { id: "search", label: "검색" },
  { id: "tag", label: "태그" },
  { id: "bell", label: "알림" },
  { id: "moon", label: "야간" },
  { id: "sun", label: "주간" },
  { id: "camera", label: "사진" },
  { id: "question", label: "질문" },
  { id: "copy", label: "문서" },
  { id: "check-circle", label: "체크" },
  { id: "heart", label: "하트" },
  { id: "heart-filled", label: "좋아요" },
  { id: "reply", label: "댓글" },
  { id: "edit", label: "수정" },
  { id: "trash", label: "삭제" },
  { id: "close", label: "닫기" },
  { id: "chevron-down", label: "화살표" },
]

const KNOWN_ICON_NAMES = new Set<IconName>(PROFILE_CARD_ICON_OPTIONS.map((option) => option.id))

export const normalizeProfileCardLinkItem = (
  item: Partial<ProfileCardLinkItem> | null | undefined,
  defaultIcon: IconName
): ProfileCardLinkItem | null => {
  if (!item) return null

  const label = (item.label || "").trim()
  const href = (item.href || "").trim()
  if (!label || !href) return null

  const icon = item.icon && KNOWN_ICON_NAMES.has(item.icon) ? item.icon : defaultIcon

  return {
    icon,
    label,
    href,
  }
}
