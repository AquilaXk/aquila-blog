import type { ErrorInfo, ReactNode } from "react"
import React from "react"

import { ApiError } from "src/apis/backend/client"
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
  requestId: string | null
}

const resolveCaughtRequestId = (error: unknown): string | null => {
  if (error instanceof ApiError) return error.requestId
  return null
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    errorId: null,
    requestId: null,
  }

  static getDerivedStateFromError(error: unknown) {
    return {
      errorId: createClientErrorId(),
      requestId: resolveCaughtRequestId(error),
    }
  }

  componentDidCatch(error: unknown, _info: ErrorInfo) {
    const errorId = this.state.errorId || createClientErrorId()
    const requestId = this.state.requestId ?? resolveCaughtRequestId(error)
    reportClientError({
      id: errorId,
      boundary: this.props.boundary,
      surface: this.props.surface,
      error,
      requestId,
    })
  }

  componentDidUpdate(previousProps: ErrorBoundaryProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.errorId) {
      this.setState({ errorId: null, requestId: null })
    }
  }

  private retry = () => {
    this.setState({ errorId: null, requestId: null })
  }

  render() {
    if (this.state.errorId) {
      return (
        <ErrorFallbackView
          variant={this.props.boundary === "global" ? "global" : "surface"}
          errorId={this.state.errorId}
          requestId={this.state.requestId}
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
