import styled from "@emotion/styled"

export const StyledWrapper = styled.section`
  margin-top: 1.5rem;
  padding: 1rem 0;
  border-top: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;

  textarea {
    width: 100%;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    border-radius: 8px;
    background-color: transparent;
    color: ${({ theme }) => theme.colors.gray12};
    padding: 0.8rem 0.95rem;
    min-height: 104px;
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
    padding: 0 0.82rem;
    border-radius: 8px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background-color: transparent;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 0.8rem;
    font-weight: 700;
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
    gap: 0.85rem;
    margin-bottom: 1rem;

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
    border-radius: 8px;
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
    border-top: 1px solid ${({ theme }) => theme.colors.gray6};
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
    font-size: 1.35rem;
    color: ${({ theme }) => theme.colors.gray12};
  }

  .countBadge {
    display: inline-flex;
    align-items: center;
    min-height: 38px;
    padding: 0 0.85rem;
    border-radius: 8px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: transparent;
    color: ${({ theme }) => theme.colors.gray11};
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
  border-radius: 50%;
  border: none;
  background: ${({ theme }) => theme.colors.gray2};

  img {
    object-fit: cover;
    object-position: center 38%;
  }
`

export const CommentItem = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.85rem;
  padding: 1.05rem 0;

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
      color: ${({ theme }) => theme.colors.gray12};
      font-size: 0.92rem;
    }

    span {
      color: ${({ theme }) => theme.colors.gray11};
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
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
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

export const EmptyState = styled.div`
  display: grid;
  gap: 0.24rem;
  margin-left: calc(44px + 0.85rem);
  padding: 0.95rem 1rem;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};

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

export const ComposerPromptCard = styled.div`
  display: grid;
  gap: 0.52rem;
  padding: 0.95rem 1rem;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};

  &[data-tone="error"] {
    border-color: ${({ theme }) => theme.colors.red6};
    background: ${({ theme }) => theme.colors.red2};
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
