import NavBar from "./NavBar"
import Logo from "./Logo"
import ThemeToggle from "./ThemeToggle"
import styled from "@emotion/styled"
import { zIndexes } from "src/styles/zIndexes"

type Props = {
  fullWidth: boolean
}

const Header: React.FC<Props> = ({ fullWidth }) => {
  return (
    <StyledWrapper>
      <div data-full-width={fullWidth} className="container">
        <Logo />
        <div className="nav">
          <ThemeToggle />
          <NavBar />
        </div>
      </div>
    </StyledWrapper>
  )
}

export default Header

const StyledWrapper = styled.div`
  z-index: ${zIndexes.header};
  position: sticky;
  top: 0;
  background-color: ${({ theme }) => theme.colors.gray1};
  border-bottom: 1px solid ${({ theme }) => theme.colors.gray5};

  .container {
    display: flex;
    padding-left: 1rem;
    padding-right: 1rem;
    gap: 0.75rem;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    max-width: 1180px;
    height: 3.5rem;
    margin: 0 auto;
    &[data-full-width="true"] {
      @media (min-width: 768px) {
        padding-left: 6rem;
        padding-right: 6rem;
      }
    }
    .nav {
      display: flex;
      gap: 0.55rem;
      align-items: center;
      flex-shrink: 0;
    }
  }

  @media (max-width: 720px) {
    .container {
      padding-left: 0.8rem;
      padding-right: 0.8rem;
      gap: 0.55rem;

      > a {
        min-width: 0;
        max-width: 42vw;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .nav {
        gap: 0.4rem;
      }
    }
  }
`
