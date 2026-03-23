import styled from "@emotion/styled"
import { useEffect } from "react"
import { createPortal } from "react-dom"

type Props = {
  open: boolean
  onClose: () => void
}

const IpSecurityInfoModal: React.FC<Props> = ({ open, onClose }) => {
  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, onClose])

  if (!open || typeof document === "undefined") return null

  return createPortal(
    <Backdrop role="presentation" onClick={onClose}>
      <Dialog
        role="dialog"
        aria-modal="true"
        aria-labelledby="ip-security-info-title"
        id="ip-security-info-dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <Header>
          <LockMark aria-hidden="true">🔒</LockMark>
          <div>
            <Eyebrow>IP 보안 안내</Eyebrow>
            <h3 id="ip-security-info-title">우리 서비스의 IP보안 적용 범위</h3>
            <p>
              네이버처럼 다단계(1/2/3) 정책은 아니며, 현재는 ON/OFF 기반의 고정형 정책입니다.
            </p>
          </div>
        </Header>

        <ModeGrid>
          <ModeCard data-mode="on">
            <strong>ON (현재 구현)</strong>
            <p>로그인 시점의 인터넷 환경(IP)과 현재 접속 환경이 같을 때만 로그인 상태를 유지합니다.</p>
          </ModeCard>
          <ModeCard data-mode="off">
            <strong>OFF</strong>
            <p>IP 지문 검증을 수행하지 않습니다. 네트워크 변경이 잦은 환경에 유리하지만 보안 강도는 낮아집니다.</p>
          </ModeCard>
        </ModeGrid>

        <DetailList>
          <li>
            <strong>차단 동작</strong>
            <span>ON 상태에서 IP가 달라지면 보안을 위해 자동 로그아웃되고, 다시 로그인해야 합니다.</span>
          </li>
          <li>
            <strong>저장 데이터</strong>
            <span>원본 IP는 저장하지 않고, 복원할 수 없는 암호화 지문만 저장합니다.</span>
          </li>
          <li>
            <strong>사용 시 유의점</strong>
            <span>모바일망/와이파이 전환 시 재로그인이 필요할 수 있습니다.</span>
          </li>
        </DetailList>

        <Notice>
          참고: 현재는 다단계 완화 정책이 없어서 ON일 때는 엄격 모드로 동작합니다.
        </Notice>

        <ActionRow>
          <CloseButton type="button" onClick={onClose}>
            확인
          </CloseButton>
        </ActionRow>
      </Dialog>
    </Backdrop>,
    document.body,
  )
}

export default IpSecurityInfoModal

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(10, 14, 26, 0.68);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  z-index: 3200;
`

const Dialog = styled.section`
  width: min(760px, 100%);
  max-height: min(88vh, 860px);
  overflow-y: auto;
  border-radius: 20px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray2};
  color: ${({ theme }) => theme.colors.gray12};
  padding: 1.2rem 1.15rem 1rem;
  display: grid;
  gap: 1rem;
`

const Header = styled.header`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.9rem;

  h3 {
    margin: 0;
    font-size: 1.22rem;
    line-height: 1.3;
  }

  p {
    margin: 0.42rem 0 0;
    color: ${({ theme }) => theme.colors.gray11};
    line-height: 1.65;
    font-size: 0.9rem;
  }
`

const LockMark = styled.div`
  width: 46px;
  height: 46px;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.green7};
  background: ${({ theme }) => theme.colors.green3};
  display: grid;
  place-items: center;
  font-size: 1.3rem;
`

const Eyebrow = styled.small`
  display: inline-block;
  color: ${({ theme }) => theme.colors.green10};
  font-weight: 800;
  margin-bottom: 0.26rem;
  letter-spacing: 0.02em;
`

const ModeGrid = styled.section`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.7rem;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`

const ModeCard = styled.article`
  border-radius: 14px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: ${({ theme }) => theme.colors.gray1};
  padding: 0.8rem 0.85rem;
  display: grid;
  gap: 0.38rem;

  strong {
    font-size: 0.94rem;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.84rem;
    line-height: 1.6;
  }

  &[data-mode="on"] {
    border-color: ${({ theme }) => theme.colors.green8};
    box-shadow: inset 0 0 0 1px rgba(18, 184, 134, 0.2);
  }
`

const DetailList = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.55rem;

  li {
    border-top: 1px solid ${({ theme }) => theme.colors.gray6};
    padding-top: 0.56rem;
    display: grid;
    gap: 0.14rem;
  }

  strong {
    font-size: 0.9rem;
  }

  span {
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.84rem;
    line-height: 1.6;
  }
`

const Notice = styled.p`
  margin: 0;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.blue7};
  background: ${({ theme }) => theme.colors.blue3};
  color: ${({ theme }) => theme.colors.blue11};
  padding: 0.7rem 0.8rem;
  font-size: 0.82rem;
  line-height: 1.55;
`

const ActionRow = styled.div`
  display: flex;
  justify-content: flex-end;
`

const CloseButton = styled.button`
  border: 0;
  border-radius: 10px;
  min-width: 92px;
  min-height: 38px;
  padding: 0.3rem 0.95rem;
  background: #12b886;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
  transition: filter 0.16s ease;

  &:hover {
    filter: brightness(1.05);
  }
`
