import styled from "@emotion/styled"

export const StyledWrapper = styled.section`
  margin-top: 64px;
  padding: 28px 0 0;
  border-top: 2px solid #111216;
  background: transparent;

  textarea {
    width: 100%;
    border: 1px solid #dfe1e5;
    border-radius: 0;
    background-color: #ffffff;
    color: #111216;
    padding: 14px;
    min-height: 110px;
    resize: vertical;
    line-height: 1.7;
  }

  button,
  a {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    min-height: 38px;
    padding: 0 14px;
    border-radius: 6px;
    border: 1px solid #dfe1e5;
    background-color: #ffffff;
    color: #111216;
    font-size: 0.8rem;
    font-weight: 750;
    cursor: pointer;

    :disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }
  }

  button.subtle {
    color: ${({ theme }) => theme.colors.gray11};
  }

  button.replyTrigger {
    justify-content: flex-start;
    padding: 0;
    min-height: auto;
    border: 0;
    background: transparent;
    color: ${({ theme }) => theme.colors.green11};
    font-size: 0.84rem;
    font-weight: 700;
  }

  button.danger {
    color: ${({ theme }) => theme.colors.red11};
    border-color: ${({ theme }) => theme.colors.red7};
    background: ${({ theme }) => theme.colors.red3};
  }

  .writeForm {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: 12px;
    margin-bottom: 22px;

    @media (max-width: 640px) {
      grid-template-columns: 1fr;
    }
  }

  .composerAvatar {
    display: flex;
    justify-content: flex-start;
    align-items: flex-start;
  }

  .composerBody {
    display: grid;
    gap: 0.6rem;
  }

  .composerFooter {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .error {
    margin: 0 0 0.9rem;
    padding: 0.72rem 0.82rem;
    border-radius: 6px;
    border: 1px solid ${({ theme }) => theme.colors.red7};
    background: transparent;
    color: ${({ theme }) => theme.colors.red11};
    font-size: 0.875rem;
  }

  .commentList {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0;
  }

  .commentList > li {
    min-width: 0;
  }

  .commentList > li + li {
    border-top: 1px solid #dfe1e5;
  }

  .commentBody[id] {
    scroll-margin-top: 7rem;
  }
`

export const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.9rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;

  h3 {
    margin: 0;
    color: #111216;
    font-size: 32px;
    line-height: 1.25;
    font-weight: 850;
    letter-spacing: -0.045em;
  }

  .countBadge {
    display: inline-flex;
    align-items: center;
    min-height: 38px;
    padding: 0 0.85rem;
    border-radius: 6px;
    border: 1px solid #dfe1e5;
    background: #ffffff;
    color: #646a73;
    font-size: 0.82rem;
    font-weight: 700;
  }
`

export const Avatar = styled.div<{ size: number }>`
  position: relative;
  width: ${({ size }) => `${size}px`};
  height: ${({ size }) => `${size}px`};
  flex-shrink: 0;
  overflow: hidden;
  display: grid;
  place-items: center;
  border-radius: 0;
  border: 1px solid #dfe1e5;
  background: #ffffff;
  color: #465b66;

  img {
    object-fit: cover;
    object-position: center 38%;
  }

  .avatarFallback {
    position: absolute;
    inset: 14%;
    display: block;
    color: inherit;
  }

  .avatarFallback::before,
  .avatarFallback::after {
    content: "";
    position: absolute;
    left: 50%;
    background: currentColor;
    transform: translateX(-50%);
  }

  .avatarFallback::before {
    top: 0;
    width: 42%;
    aspect-ratio: 1;
    border-radius: 50%;
  }

  .avatarFallback::after {
    right: 0;
    bottom: 0;
    left: 0;
    height: 45%;
    border-radius: 999px 999px 2px 2px;
    transform: none;
  }
`

export const CommentItem = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.85rem;
  padding: 22px 0;

  &[data-reply="true"] {
    position: relative;
    margin-left: 1.15rem;
    padding: 0.95rem 0 0.95rem 0.85rem;
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  &[data-reply="true"]::before {
    content: "";
    position: absolute;
    left: -0.95rem;
    top: 1.05rem;
    bottom: 1.05rem;
    width: 1px;
    border-radius: 999px;
    background: ${({ theme }) => theme.colors.gray7};
  }

  &[data-reply="true"]::after {
    content: "";
    position: absolute;
    left: -0.95rem;
    top: 1.05rem;
    width: 0.95rem;
    height: 1px;
    background: ${({ theme }) => theme.colors.gray7};
  }

  @media (max-width: 640px) {
    &[data-reply="true"] {
      margin-left: 0.7rem;
      padding: 0.85rem 0.85rem 0.9rem;
    }

    &[data-reply="true"]::before {
      left: -0.65rem;
    }

    &[data-reply="true"]::after {
      left: -0.65rem;
      width: 0.65rem;
    }
  }

  .commentBody {
    min-width: 0;
  }

  .head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.85rem;
    flex-wrap: wrap;
    margin-bottom: 0.65rem;
  }

  .meta {
    display: grid;
    gap: 0.14rem;
  }

  .metaPrimary {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.38rem 0.52rem;

    strong {
      color: #111216;
      font-size: 0.92rem;
    }

    span {
      color: #646a73;
      font-size: 0.78rem;
    }
  }

  .replyContext {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.2rem;
    height: 1.2rem;
    border-radius: 999px;
    color: ${({ theme }) => theme.colors.green11};
    background: ${({ theme }) => theme.colors.green3};
    flex-shrink: 0;
  }

  .actions,
  .editActions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .topActions {
    margin-left: auto;
  }

  .content {
    margin: 8px 0 0;
    color: #646a73;
    line-height: 1.7;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .foot {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    margin-top: 0.95rem;
  }

  .editBox,
  .replyForm {
    display: grid;
    gap: 0.55rem;
    margin-top: 0.7rem;
  }

  @media (max-width: 640px) {
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.75rem;
    padding: 0.95rem 0;

    .topActions {
      width: 100%;
      margin-left: 0;
      justify-content: flex-start;
    }

    .metaPrimary {
      gap: 0.22rem 0.45rem;
    }

    .content {
      font-size: 0.96rem;
      line-height: 1.65;
    }

    .foot {
      margin-top: 0.72rem;
    }
  }
`

export const ReplyGroup = styled.div`
  margin-top: 1rem;
  padding-left: 0.95rem;
  border-left: 1px solid ${({ theme }) => theme.colors.gray6};

  @media (max-width: 640px) {
    margin-top: 0.85rem;
    padding-left: 0.8rem;
  }
`

export const ReplyList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.75rem;

  > li {
    min-width: 0;
  }

  @media (max-width: 640px) {
    gap: 0.65rem;
  }
`

// 패밀리룩(1224): 라운드 박스 셸 → 헤어라인 좌측 rule 구획(면/그림자 없음)
export const EmptyState = styled.div`
  display: grid;
  gap: 0.24rem;
  margin-left: calc(44px + 0.85rem);
  padding: 0.1rem 0 0.1rem 0.9rem;
  border-left: 2px solid ${({ theme }) => theme.publicDesign.border};

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.94rem;
    line-height: 1.35;
  }

  span {
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.84rem;
    line-height: 1.5;
  }

  @media (max-width: 640px) {
    margin-left: 0;
    padding: 0.9rem 0.92rem;
  }
`

// 패밀리룩(1224): 로그인 유도 라운드 박스 → 헤어라인 좌측 rule 구획(면/그림자 없음)
export const ComposerPromptCard = styled.div`
  display: grid;
  gap: 0.52rem;
  padding: 0.1rem 0 0.1rem 0.9rem;
  border-left: 2px solid ${({ theme }) => theme.publicDesign.border};

  &[data-tone="error"] {
    border-left-color: ${({ theme }) => theme.colors.statusDangerBorder};
  }

  strong {
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.94rem;
    font-weight: 800;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray10};
    font-size: 0.84rem;
    line-height: 1.55;
  }

  button {
    justify-self: start;
  }
`

export const CommentListSkeleton = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.95rem;

  li {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.78rem;
    align-items: start;
  }

  .avatar,
  .title,
  .line {
    display: block;
    background: ${({ theme }) => theme.colors.gray3};
    animation: comment-box-skeleton-pulse 1.18s ease-in-out infinite;
  }

  .avatar {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 999px;
  }

  .body {
    display: grid;
    gap: 0.52rem;
  }

  .title {
    width: min(28%, 8rem);
    height: 0.88rem;
    border-radius: 999px;
  }

  .line {
    height: 0.84rem;
    border-radius: 999px;
  }

  .line.wide {
    width: min(84%, 30rem);
  }

  .line.medium {
    width: min(62%, 22rem);
  }

  .line.narrow {
    width: min(48%, 18rem);
  }

  @keyframes comment-box-skeleton-pulse {
    0% {
      opacity: 0.72;
    }
    50% {
      opacity: 1;
    }
    100% {
      opacity: 0.72;
    }
  }
`
