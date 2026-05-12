import styled from "@emotion/styled"

type EditorStudioMobileStepNavigatorProps<Step extends string> = {
  steps: readonly Step[]
  activeStep: Step
  stepLabels: Record<Step, string>
  stepDescriptions: Record<Step, string>
  prevStep: Step | null
  nextStep: Step | null
  prevStepLabel: string
  nextStepLabel: string
  isCompactMobileLayout: boolean
  onStepChange: (step: Step) => void
}

export const EditorStudioMobileStepNavigator = <Step extends string,>({
  steps,
  activeStep,
  stepLabels,
  stepDescriptions,
  prevStep,
  nextStep,
  prevStepLabel,
  nextStepLabel,
  isCompactMobileLayout,
  onStepChange,
}: EditorStudioMobileStepNavigatorProps<Step>) => (
  <>
    <MobileStudioStepper role="tablist" aria-label="모바일 작업 단계">
      {steps.map((step) => (
        <button
          key={step}
          type="button"
          role="tab"
          aria-selected={activeStep === step}
          data-active={activeStep === step}
          onClick={() => onStepChange(step)}
        >
          {stepLabels[step]}
        </button>
      ))}
    </MobileStudioStepper>
    {isCompactMobileLayout ? (
      <MobileStepGuide role="status" aria-live="polite">
        <strong>{`현재 단계: ${stepLabels[activeStep]}`}</strong>
        <p>{stepDescriptions[activeStep]}</p>
        <div>
          <Button
            type="button"
            disabled={!prevStep}
            onClick={() => {
              if (!prevStep) return
              onStepChange(prevStep)
            }}
          >
            {prevStepLabel}
          </Button>
          <PrimaryButton
            type="button"
            disabled={!nextStep}
            onClick={() => {
              if (!nextStep) return
              onStepChange(nextStep)
            }}
          >
            {nextStepLabel}
          </PrimaryButton>
        </div>
      </MobileStepGuide>
    ) : null}
  </>
)

const MobileStudioStepper = styled.div`
  display: none;

  @media (max-width: 720px) {
    position: sticky;
    top: calc(var(--app-header-height, 56px) + 0.32rem);
    z-index: 12;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.4rem;
    margin: 0.2rem 0 0.4rem;
    padding: 0.5rem;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    border-radius: 10px;
    background: ${({ theme }) => theme.colors.gray2};

    > button {
      min-height: 38px;
      border-radius: 999px;
      border: 1px solid ${({ theme }) => theme.colors.gray6};
      background: transparent;
      color: ${({ theme }) => theme.colors.gray11};
      font-size: 0.77rem;
      font-weight: 700;
      cursor: pointer;
    }

    > button[data-active="true"] {
      border-color: ${({ theme }) => theme.colors.blue8};
      color: ${({ theme }) => theme.colors.blue11};
      background: ${({ theme }) => theme.colors.blue3};
    }
  }
`

const MobileStepGuide = styled.section`
  display: none;

  @media (max-width: 720px) {
    display: grid;
    gap: 0.58rem;
    margin-bottom: 0.28rem;
    padding: 0.66rem 0.72rem;
    border-radius: 10px;
    border: 1px solid ${({ theme }) => theme.colors.gray6};
    background: ${({ theme }) => theme.colors.gray2};

    strong {
      font-size: 0.86rem;
      color: ${({ theme }) => theme.colors.gray12};
      line-height: 1.4;
    }

    p {
      margin: 0;
      font-size: 0.76rem;
      line-height: 1.5;
      color: ${({ theme }) => theme.colors.gray10};
    }

    > div {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.5rem;
    }

    button {
      min-height: 38px;
      width: 100%;
      justify-content: center;
    }
  }

  @media (max-width: 520px) {
    > div {
      grid-template-columns: 1fr;
    }
  }
`

const Button = styled.button`
  border: 1px solid ${({ theme }) => theme.colors.gray6};
  border-radius: 8px;
  padding: 0.62rem 0.92rem;
  min-height: 44px;
  background: transparent;
  color: ${({ theme }) => theme.colors.gray10};
  cursor: pointer;
  font-size: 0.84rem;
  font-weight: 600;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease,
    color 0.18s ease,
    box-shadow 0.18s ease;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.gray8};
    background: ${({ theme }) => theme.colors.gray3};
    color: ${({ theme }) => theme.colors.gray12};
  }

  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => theme.colors.blue8};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.blue4};
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`

const PrimaryButton = styled(Button)`
  border-radius: 8px;
  padding: 0.6rem 0.88rem;
  border-color: ${({ theme }) => theme.colors.blue9};
  background: ${({ theme }) => theme.colors.blue9};
  color: ${({ theme }) => theme.colors.gray1};
  font-weight: 700;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.blue10};
    background: ${({ theme }) => theme.colors.blue10};
    color: ${({ theme }) => theme.colors.gray1};
  }
`
