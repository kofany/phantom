import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { KebabMenu, KebabAction } from './KebabMenu'

describe('KebabMenu', () => {
  it('renders nothing when actions are empty', () => {
    const { container } = render(<KebabMenu actions={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('opens the menu on trigger click and shows actions', async () => {
    const user = userEvent.setup()
    const onA = vi.fn()
    const acts: KebabAction[] = [
      { id: 'a', label: 'Action A', onClick: onA },
      { id: 'b', label: 'Action B', onClick: vi.fn() },
    ]
    render(<KebabMenu actions={acts} ariaLabel="Test menu" />)

    expect(screen.queryByText('Action A')).not.toBeInTheDocument()

    await user.click(screen.getByLabelText('Test menu'))
    expect(screen.getByText('Action A')).toBeInTheDocument()
    expect(screen.getByText('Action B')).toBeInTheDocument()
  })

  it('calls onClick and closes on action click', async () => {
    const user = userEvent.setup()
    const onA = vi.fn()
    render(
      <KebabMenu
        actions={[{ id: 'a', label: 'Run', onClick: onA }]}
        ariaLabel="m"
      />,
    )
    await user.click(screen.getByLabelText('m'))
    await user.click(screen.getByText('Run'))

    expect(onA).toHaveBeenCalledOnce()
    expect(screen.queryByText('Run')).not.toBeInTheDocument()
  })

  it('disabled action does not fire onClick and is not clickable', async () => {
    const user = userEvent.setup()
    const onA = vi.fn()
    render(
      <KebabMenu
        actions={[{ id: 'a', label: 'Blocked', disabled: true, disabledReason: 'no perm', onClick: onA }]}
        ariaLabel="m"
      />,
    )
    await user.click(screen.getByLabelText('m'))
    const item = screen.getByText('Blocked')
    expect(item.closest('button')).toBeDisabled()

    // userEvent.click respects `disabled` — onClick should never fire.
    await user.click(item).catch(() => {})
    expect(onA).not.toHaveBeenCalled()
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    render(
      <KebabMenu
        actions={[{ id: 'a', label: 'Item', onClick: vi.fn() }]}
        ariaLabel="m"
      />,
    )
    await user.click(screen.getByLabelText('m'))
    expect(screen.getByText('Item')).toBeInTheDocument()

    // KebabMenu attaches its keydown listener to document, not the menu
    // root — fireEvent on document dispatches in the same way userEvent
    // would for an unfocused-but-bubbling key event.
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByText('Item')).not.toBeInTheDocument()
    })
  })

  it('marks destructive actions with the danger class', async () => {
    const user = userEvent.setup()
    render(
      <KebabMenu
        actions={[
          { id: 'a', label: 'Safe', onClick: vi.fn() },
          { id: 'b', label: 'Wipe', destructive: true, onClick: vi.fn() },
        ]}
        ariaLabel="m"
      />,
    )
    await user.click(screen.getByLabelText('m'))

    const wipe = screen.getByText('Wipe').closest('button')
    expect(wipe).toHaveClass('destructive')
    const safe = screen.getByText('Safe').closest('button')
    expect(safe).not.toHaveClass('destructive')
  })
})
