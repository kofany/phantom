import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusDot } from './StatusDot'

describe('StatusDot', () => {
  it('renders the state as default label when none provided', () => {
    render(<StatusDot state="online" />)
    expect(screen.getByText('online')).toBeInTheDocument()
  })

  it('renders a custom label', () => {
    render(<StatusDot state="online" label="Live" />)
    expect(screen.getByText('Live')).toBeInTheDocument()
  })

  it('applies the state as a CSS class', () => {
    const { container, rerender } = render(<StatusDot state="online" />)
    expect(container.firstChild).toHaveClass('status-dot', 'online')
    rerender(<StatusDot state="offline" />)
    expect(container.firstChild).toHaveClass('status-dot', 'offline')
    rerender(<StatusDot state="lag" />)
    expect(container.firstChild).toHaveClass('status-dot', 'lag')
    rerender(<StatusDot state="connecting" />)
    expect(container.firstChild).toHaveClass('status-dot', 'connecting')
  })
})
