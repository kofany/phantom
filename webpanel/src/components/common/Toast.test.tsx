import { describe, expect, it, beforeEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { toast, ToastContainer } from './Toast'
import { clearHistory, getHistory } from '../../toastHistory'

beforeEach(() => {
  clearHistory()
  vi.useFakeTimers()
})

describe('toast() + ToastContainer', () => {
  it('renders nothing when no toasts have fired', () => {
    const { container } = render(<ToastContainer />)
    expect(container.firstChild).toBeNull()
  })

  it('renders a fired toast', () => {
    render(<ToastContainer />)
    act(() => {
      toast('success', 'Saved successfully')
    })
    expect(screen.getByText('Saved successfully')).toBeInTheDocument()
  })

  it('dedupes identical toasts within 1.5s', () => {
    render(<ToastContainer />)
    act(() => {
      toast('error', 'Boom')
      toast('error', 'Boom') // duplicate within window — should drop
    })
    const matches = screen.getAllByText('Boom')
    expect(matches).toHaveLength(1)
  })

  it('does NOT dedupe across types (same message, different severity)', () => {
    render(<ToastContainer />)
    act(() => {
      toast('error', 'Status')
      toast('success', 'Status') // different type → distinct entry
    })
    expect(screen.getAllByText('Status')).toHaveLength(2)
  })

  it('also pushes to toast history', () => {
    expect(getHistory()).toHaveLength(0)
    act(() => {
      toast('info', 'Saved')
    })
    const history = getHistory()
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({ type: 'info', message: 'Saved' })
  })
})
