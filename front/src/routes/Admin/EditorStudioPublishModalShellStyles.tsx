import styled from "@emotion/styled"

export const PublishModalBackdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.42);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 120;
  padding: 1rem;

  &[data-variant="drawer"] {
    justify-content: flex-end;
    padding: 0;
  }
`

export const PublishDialog = styled.div`
  width: min(1120px, calc(100vw - 2rem));
  max-height: min(88vh, 940px);
  overflow: auto;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  padding: 1.1rem 1.15rem 0;
  display: grid;
  gap: 0.95rem;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.34);

  &[data-variant="drawer"] {
    width: min(560px, 100vw);
    max-height: 100vh;
    height: 100vh;
    border-radius: 0;
    border-left: 1px solid ${({ theme }) => theme.colors.gray6};
    border-right: 0;
    border-top: 0;
    border-bottom: 0;
    padding-top: max(1rem, env(safe-area-inset-top, 0px));
    padding-bottom: 0;
    box-shadow: -18px 0 44px rgba(0, 0, 0, 0.28);
  }

  @media (max-width: 720px) {
    width: min(100%, 34rem);
    max-height: min(92vh, 980px);
    padding: 0.82rem 0.82rem 0;
    gap: 0.78rem;
  }
`

export const PublishModalHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;

  h4 {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray12};
    font-size: 1.1rem;
    font-weight: 750;
    line-height: 1.28;
  }
`

export const PublishModalBody = styled.div`
  display: grid;
  gap: 0.86rem;
  padding-bottom: 0.95rem;
`

export const PublishModalFooter = styled.div`
  position: sticky;
  bottom: 0;
  display: flex;
  justify-content: flex-end;
  gap: 0.52rem;
  padding: 0.78rem 0;
  border-top: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};

  @media (max-width: 480px) {
    flex-direction: column-reverse;

    > button {
      width: 100%;
      justify-content: center;
    }
  }
`
