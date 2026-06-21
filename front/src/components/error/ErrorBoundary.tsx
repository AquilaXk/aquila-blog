import type { ErrorInfo, ReactNode } from "react"
import React from "react"

import { ErrorFallbackView } from "./ErrorFallbackView"
import {
  createClientErrorId,
  reportClientError,
  type ClientErrorBoundaryKind,
  type ClientErrorSurface,
} from "src/libs/rum/reportClientError"

type ErrorBoundaryProps = {
  children: ReactNode
  boundary: ClientErrorBoundaryKind
  surface: ClientErrorSurface
  resetKey?: string | number
}

type ErrorBoundaryState = {
  errorId: string | null
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    errorId: null,
  }

  static getDerivedStateFromError() {
    return {
      errorId: createClientErrorId(),
    }
  }

  componentDidCatch(error: unknown, _info: ErrorInfo) {
    const errorId = this.state.errorId || createClientErrorId()
    reportClientError({
      id: errorId,
      boundary: this.props.boundary,
      surface: this.props.surface,
      error,
    })
  }

  componentDidUpdate(previousProps: ErrorBoundaryProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.errorId) {
      this.setState({ errorId: null })
    }
  }

  private retry = () => {
    this.setState({ errorId: null })
  }

  render() {
    if (this.state.errorId) {
      return (
        <ErrorFallbackView
          variant={this.props.boundary === "global" ? "global" : "surface"}
          errorId={this.state.errorId}
          onRetry={this.retry}
        />
      )
    }

    return this.props.children
  }
}

type BoundaryWrapperProps = {
  children: ReactNode
  resetKey?: string | number
}

export const GlobalErrorBoundary = ({ children, resetKey }: BoundaryWrapperProps) => (
  <ErrorBoundary boundary="global" surface="app" resetKey={resetKey}>
    {children}
  </ErrorBoundary>
)

export const RecoverableSurfaceBoundary = ({
  children,
  resetKey,
  surface,
}: BoundaryWrapperProps & { surface: Exclude<ClientErrorSurface, "app"> }) => (
  <ErrorBoundary boundary="surface" surface={surface} resetKey={resetKey}>
    {children}
  </ErrorBoundary>
)
