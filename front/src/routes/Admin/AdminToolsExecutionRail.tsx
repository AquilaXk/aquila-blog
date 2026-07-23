import Link from "next/link"

import {
  type DiagnosticTab,
  type InlineNoticeTone,
  type SectionKey,
} from "src/routes/Admin/AdminToolsWorkspaceModel"
import {
  ActionGroupCard,
  ActionList,
  ActionRowButton,
  ActionRowLink,
  ActionToneBadge,
  CardSectionHeading,
  ExecutionRail,
  FieldBox,
  FieldLabel,
  FieldStack,
  InlineNotice,
  Input,
  PrimaryButton,
} from "src/routes/Admin/AdminToolsWorkspace.styles"

export type AdminToolsExecutionRailProps = {
  isBusy: boolean
  mailTestNotice: {
    tone: InlineNoticeTone
    text: string
  }
  onFocusSection: (section: SectionKey, tab?: DiagnosticTab) => void
  onPostCountCheck: () => void
  onSendSignupTestMail: () => void
  onSystemHealthCheck: () => void
  onTestEmailChange: (value: string) => void
  testEmail: string
}

export default function AdminToolsExecutionRail({
  isBusy,
  mailTestNotice,
  onFocusSection,
  onPostCountCheck,
  onSendSignupTestMail,
  onSystemHealthCheck,
  onTestEmailChange,
  testEmail,
}: AdminToolsExecutionRailProps) {
  return (
    <ExecutionRail>
      <ActionGroupCard>
        <CardSectionHeading>
          <div>
            <h3>실행 전 체크</h3>
          </div>
        </CardSectionHeading>
        <ActionList>
          <ActionRowButton type="button" disabled={isBusy} onClick={onSystemHealthCheck}>
            <span>서비스 상태 조회</span>
          </ActionRowButton>
          <ActionRowButton type="button" disabled={isBusy} onClick={onPostCountCheck}>
            <span>전체 글 수 확인</span>
          </ActionRowButton>
        </ActionList>
      </ActionGroupCard>

      <ActionGroupCard>
        <CardSectionHeading>
          <div>
            <h3>위험 액션</h3>
          </div>
          <ActionToneBadge data-tone="write">실행 가능</ActionToneBadge>
        </CardSectionHeading>
        <FieldStack>
          <FieldBox>
            <FieldLabel htmlFor="signup-mail-test-email">테스트 메일 주소</FieldLabel>
            <Input
              id="signup-mail-test-email"
              type="email"
              value={testEmail}
              placeholder="메일 수신을 확인할 주소를 입력하세요"
              onChange={(event) => onTestEmailChange(event.target.value)}
            />
          </FieldBox>
          <PrimaryButton type="button" disabled={isBusy} onClick={onSendSignupTestMail}>
            테스트 메일 발송
          </PrimaryButton>
          {!!mailTestNotice.text && <InlineNotice data-tone={mailTestNotice.tone}>{mailTestNotice.text}</InlineNotice>}
        </FieldStack>
      </ActionGroupCard>

      <ActionGroupCard>
        <CardSectionHeading>
          <div>
            <h3>런북/장애 문서</h3>
          </div>
        </CardSectionHeading>
        <ActionList>
          <Link href="/admin/dashboard" passHref legacyBehavior>
            <ActionRowLink>운영 대시보드 열기</ActionRowLink>
          </Link>
          <ActionRowButton type="button" disabled={isBusy} onClick={() => onFocusSection("diagnostics", "queue")}>
            <span>작업 큐 진단으로 이동</span>
          </ActionRowButton>
          <ActionRowButton type="button" disabled={isBusy} onClick={() => onFocusSection("execution", "auth")}>
            <span>인증 보안 기록으로 이동</span>
          </ActionRowButton>
        </ActionList>
      </ActionGroupCard>
    </ExecutionRail>
  )
}
