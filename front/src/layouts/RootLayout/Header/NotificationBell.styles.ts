import styled from "@emotion/styled"

export const StyledWrapper = styled.div`
  position: relative;
  display: flex;
  align-items: center;

  .trigger {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: ${({ theme }) => theme.variables.navControl.height}px;
    min-height: ${({ theme }) => theme.variables.navControl.height}px;
    width: auto;
    height: ${({ theme }) => theme.variables.navControl.height}px;
    padding: 0 0.34rem;
    border-radius: 8px;
    border: none;
    background: transparent;
    color: ${({ theme }) => theme.colors.gray11};
    flex-shrink: 0;
    transition: color 0.16s ease, text-decoration-color 0.16s ease;

    &:hover,
    &[data-open="true"] {
      color: ${({ theme }) => theme.colors.gray12};
      text-decoration: underline;
      text-underline-offset: 3px;
      text-decoration-thickness: 1px;
    }

    &:focus-visible {
      outline: none;
      box-shadow: 0 0 0 2px ${({ theme }) => theme.colors.blue4};
    }

    svg {
      width: 18px;
      height: 18px;
      display: block;
    }
  }

  .badge {
    position: absolute;
    top: -5px;
    right: -6px;
    min-width: 18px;
    height: 18px;
    padding: 0 0.24rem;
    border-radius: 999px;
    background: ${({ theme }) => theme.colors.red10};
    color: white;
    font-size: 0.62rem;
    font-weight: 700;
    line-height: 18px;
    text-align: center;
    border: 2px solid ${({ theme }) => theme.colors.gray2};
  }

  .panel {
    position: absolute;
    top: calc(100% + 0.5rem);
    right: 0;
    width: min(24rem, calc(100vw - 1.6rem));
    max-height: min(70vh, 28rem);
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    border-radius: 16px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray2};
    box-shadow: 0 20px 42px rgba(0, 0, 0, 0.44);
    padding: 0.74rem;
    overflow: hidden;
    transform-origin: top right;
    animation: panelIn 0.14s ease-out;
    z-index: 30;

    &:focus-visible {
      outline: none;
      box-shadow:
        0 0 0 2px ${({ theme }) => theme.colors.blue4},
        0 20px 42px rgba(0, 0, 0, 0.44);
    }
  }

  .mobileBackdrop {
    display: none;
  }

  @keyframes panelIn {
    from {
      opacity: 0;
      transform: translateY(-4px) scale(0.985);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .panelHead {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.7rem;
    margin-bottom: 0.62rem;
    padding: 0.08rem 0.12rem;
  }

  .panelTitle {
    display: inline-flex;
    align-items: center;
    gap: 0.46rem;
    min-width: 0;

    strong {
      display: block;
      color: ${({ theme }) => theme.colors.gray12};
      font-size: 0.96rem;
      margin: 0;
    }

    small {
      display: inline-flex;
      align-items: center;
      min-height: 22px;
      padding: 0 0.46rem;
      border-radius: 999px;
      border: 1px solid ${({ theme }) => theme.colors.gray6};
      color: ${({ theme }) => theme.colors.gray10};
      background: ${({ theme }) => theme.colors.gray2};
      font-size: 0.68rem;
      font-weight: 700;
      white-space: nowrap;
    }
  }

  .readAllBtn {
    min-height: 30px;
    padding: 0 0.66rem;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray3};
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.72rem;
    font-weight: 700;
    white-space: nowrap;
    transition: border-color 0.16s ease, color 0.16s ease, background-color 0.16s ease;

    &:hover:not(:disabled) {
      border-color: ${({ theme }) => theme.colors.gray7};
      color: ${({ theme }) => theme.colors.gray12};
      background: ${({ theme }) => theme.colors.gray4};
    }

    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.46rem;
    min-height: 0;
    overflow: auto;
    scrollbar-width: thin;
    scrollbar-color: ${({ theme }) => theme.colors.gray7} transparent;

    &::-webkit-scrollbar {
      width: 7px;
    }

    &::-webkit-scrollbar-thumb {
      border-radius: 999px;
      background: ${({ theme }) => theme.colors.gray7};
    }
  }

  .itemBtn {
    width: 100%;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 0.62rem;
    align-items: center;
    padding: 0.66rem 0.72rem;
    border-radius: 12px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray1};
    text-align: left;
    transition: border-color 0.16s ease, background-color 0.16s ease, transform 0.16s ease;

    &:hover {
      border-color: ${({ theme }) => theme.colors.gray7};
      background: ${({ theme }) => theme.colors.gray2};
      transform: translateY(-1px);
    }

    &:focus-visible {
      outline: none;
      border-color: ${({ theme }) => theme.colors.blue8};
      box-shadow: 0 0 0 2px ${({ theme }) => theme.colors.blue4};
    }

    &[data-read="false"] {
      border-color: ${({ theme }) => theme.colors.blue7};
      background: ${({ theme }) => "rgba(24, 67, 135, 0.22)"};
    }
  }

  .avatar {
    position: relative;
    width: 36px;
    height: 36px;
    border-radius: 999px;
    overflow: hidden;
    flex-shrink: 0;
    background: ${({ theme }) => theme.colors.gray4};
  }

  .copy {
    min-width: 0;

    p,
    small {
      margin: 0;
    }

    p {
      color: ${({ theme }) => theme.colors.gray12};
      font-size: 0.8rem;
      line-height: 1.43;
      margin-bottom: 0.18rem;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    small {
      color: ${({ theme }) => theme.colors.gray10};
      display: block;
      font-size: 0.73rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }

  .headLine {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.24rem;

    strong {
      color: ${({ theme }) => theme.colors.gray12};
      font-size: 0.79rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    span {
      color: ${({ theme }) => theme.colors.gray10};
      font-size: 0.69rem;
      flex-shrink: 0;
    }
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: ${({ theme }) => theme.colors.blue9};
    flex-shrink: 0;
  }

  .empty {
    display: grid;
    gap: 0;
    padding: 1rem 0.28rem 0.45rem;
    text-align: center;

    strong {
      color: ${({ theme }) => theme.colors.gray12};
      font-size: 0.84rem;
    }
  }

  @media (max-width: 720px) {
    .mobileBackdrop {
      display: block;
      position: fixed;
      inset: 0;
      border: 0;
      padding: 0;
      margin: 0;
      background: rgba(2, 6, 23, 0.42);
      z-index: 35;
      cursor: default;
    }

    .trigger {
      min-width: 36px;
      min-height: 36px;
      width: auto;
      height: 36px;
      padding: 0 0.34rem;

      svg {
        width: 18px;
        height: 18px;
      }
    }

    .panel {
      position: fixed;
      left: max(0.48rem, env(safe-area-inset-left, 0px));
      right: max(0.48rem, env(safe-area-inset-right, 0px));
      bottom: calc(env(safe-area-inset-bottom, 0px) + 0.48rem);
      top: auto;
      width: auto;
      max-height: min(72dvh, 34rem);
      padding: 0.62rem;
      border-radius: 16px;
      animation-name: panelInMobile;
      transform-origin: bottom center;
      z-index: 36;
    }

    .panelHead {
      margin-bottom: 0.56rem;

      strong {
        font-size: 0.92rem;
      }

      span {
        display: none;
      }
    }

    .readAllBtn {
      min-height: 32px;
      padding: 0 0.72rem;
    }

    .itemBtn {
      padding: 0.64rem 0.64rem;
      gap: 0.56rem;
    }

    .copy p {
      font-size: 0.78rem;
      line-height: 1.42;
      margin-bottom: 0.14rem;
    }

    .headLine {
      align-items: flex-start;
      justify-content: flex-start;
      flex-direction: column;
      gap: 0.12rem;
      margin-bottom: 0.2rem;
    }

    .headLine strong {
      font-size: 0.76rem;
      max-width: 100%;
    }

    .headLine span {
      font-size: 0.66rem;
    }

    .list {
      gap: 0.42rem;
    }
  }

  @keyframes panelInMobile {
    from {
      opacity: 0;
      transform: translateY(12px) scale(0.992);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
`
