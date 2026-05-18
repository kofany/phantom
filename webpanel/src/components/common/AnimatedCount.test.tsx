import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AnimatedCount } from './AnimatedCount'

describe('AnimatedCount', () => {
  it('renders the value', () => {
    render(<AnimatedCount value={42} />)
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('does not flash on the initial mount', () => {
    render(<AnimatedCount value={5} />)
    // data-flash attr is the marker the CSS keyframe selector targets;
    // first render should never set it (per the mountedRef gate).
    const span = screen.getByText('5')
    expect(span.getAttribute('data-flash')).toBeNull()
  })

  it('flashes when the value transitions', () => {
    const { rerender } = render(<AnimatedCount value={5} />)
    expect(screen.getByText('5').getAttribute('data-flash')).toBeNull()

    rerender(<AnimatedCount value={6} />)
    expect(screen.getByText('6').getAttribute('data-flash')).toBe('1')
  })

  it('does not flash when value is set to the same number', () => {
    const { rerender } = render(<AnimatedCount value={5} />)
    rerender(<AnimatedCount value={5} />)
    expect(screen.getByText('5').getAttribute('data-flash')).toBeNull()
  })

  it('honors a custom className', () => {
    render(<AnimatedCount value={9} className="tile-value-anim" />)
    const span = screen.getByText('9')
    expect(span).toHaveClass('tile-value-anim')
  })
})
