'use client'

import React, { Component, ErrorInfo, ReactNode } from 'react'

/**
 * ============================================================================
 * COMPONENT: MapErrorBoundary
 * ============================================================================
 * 
 * WHAT IT DOES:
 * This component acts as a protective shield around interactive maps (such as
 * Leaflet in LiveDispatchMap).
 * 
 * WHY IT IS NEEDED:
 * Third-party map libraries directly manipulate the browser DOM and WebGL/Canvas
 * layers. If a corrupted GPS coordinate, unmounted container, network tile glitch,
 * or browser extension causes a runtime JavaScript crash in the map, a standard
 * React app will crash the entire page into a white screen.
 * 
 * By wrapping the map inside this ErrorBoundary:
 * 1. The crash is contained strictly to the map area.
 * 2. The operator queue, order entry form, cashier, and driver list stay 100% active.
 * 3. A user-friendly recovery card is displayed with a "Reload Map" button.
 * ============================================================================
 */

interface Props {
  children: ReactNode
  fallbackTitle?: string
}

interface State {
  hasError: boolean
  errorMessage: string | null
}

export default class MapErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      errorMessage: null
    }
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error?.message || 'An unexpected error occurred while rendering the map.'
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to console for operator diagnosis
    console.error('[MapErrorBoundary caught an error]:', error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorMessage: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full w-full rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20 p-6 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 flex items-center justify-center text-xl font-bold mb-3">
            ⚠️
          </div>
          <h3 className="font-bold text-gray-900 dark:text-white text-base mb-1">
            {this.props.fallbackTitle || 'Map Rendering Suspended'}
          </h3>
          <p className="text-xs text-gray-600 dark:text-gray-400 max-w-md mb-4">
            An issue occurred while displaying the map tiles or marker layer. Your orders and active queues remain fully functional.
          </p>
          {this.state.errorMessage && (
            <p className="text-[11px] font-mono text-red-500 bg-white dark:bg-gray-900 px-3 py-1.5 rounded border border-red-200 dark:border-red-800 mb-4 max-w-md truncate">
              {this.state.errorMessage}
            </p>
          )}
          <button
            type="button"
            onClick={this.handleRetry}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
          >
            Reload Map View
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
