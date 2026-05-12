import styled from "@emotion/styled"

type EditorStudioResultLogPanelProps = {
  loadingKey: string
  result: string
  variant: "dedicated" | "standard"
  eyebrow?: string
  loadingTitle: string
  idleTitle: string
  loadingDescription: (loadingKey: string) => string
  idleDescription: string
}

export const EditorStudioResultLogPanel = ({
  loadingKey,
  result,
  variant,
  eyebrow,
  loadingTitle,
  idleTitle,
  loadingDescription,
  idleDescription,
}: EditorStudioResultLogPanelProps) => {
  if (!loadingKey && !result) return null

  return (
    <ResultLogPanel data-variant={variant}>
      <details open={Boolean(loadingKey)}>
        <summary>
          <div>
            {eyebrow ? <ResultLogEyebrow>{eyebrow}</ResultLogEyebrow> : null}
            <strong>{loadingKey ? loadingTitle : idleTitle}</strong>
          </div>
          <span>{loadingKey ? loadingDescription(loadingKey) : idleDescription}</span>
        </summary>
        <ResultLogBody>{result || "// API 응답 결과가 여기에 표시됩니다."}</ResultLogBody>
      </details>
    </ResultLogPanel>
  )
}

const ResultLogPanel = styled.section`
  &[data-variant="dedicated"] {
    width: 100%;
    max-width: var(--article-readable-width, 48rem);
    min-width: 0;
    margin-inline: auto;
    border-top: 1px solid ${({ theme }) => theme.colors.gray5};
    padding-top: 0.9rem;
  }

  &[data-variant="standard"] {
    margin-top: 1rem;
    border-radius: 0;
    border: 0;
    border-top: 1px solid ${({ theme }) => theme.colors.gray6};
    border-bottom: 1px solid ${({ theme }) => theme.colors.gray6};
    background: transparent;
    overflow: hidden;
  }

  details {
    display: grid;
  }

  &[data-variant="dedicated"] details {
    gap: 0.75rem;
  }

  summary {
    list-style: none;
    cursor: pointer;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.8rem;
  }

  &[data-variant="standard"] summary {
    padding: 0.95rem 1rem;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  strong {
    display: block;
    color: ${({ theme }) => theme.colors.gray12};
  }

  &[data-variant="dedicated"] strong {
    font-size: 0.92rem;
  }

  &[data-variant="standard"] strong {
    margin-top: 0.18rem;
    font-size: 0.96rem;
  }

  span {
    color: ${({ theme }) => theme.colors.gray10};
    line-height: 1.5;
  }

  &[data-variant="dedicated"] span {
    font-size: 0.76rem;
  }

  &[data-variant="standard"] span {
    color: ${({ theme }) => theme.colors.gray11};
    font-size: 0.78rem;
    white-space: nowrap;
  }

  &[data-variant="standard"] > details > pre {
    margin: 0 1rem 1rem;
  }

  @media (max-width: 720px) {
    &[data-variant="standard"] summary {
      flex-direction: column;
    }

    &[data-variant="standard"] span {
      white-space: normal;
    }
  }
`

const ResultLogEyebrow = styled.span`
  display: none;
`

const ResultLogBody = styled.pre`
  margin: 0;
  padding: 1rem;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  background: transparent;
  color: ${({ theme }) => theme.colors.gray12};
  font-size: 0.82rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  min-height: 160px;
`
