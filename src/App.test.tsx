import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import App from './App'

afterEach(cleanup)

describe('step grid', () => {
  it('renders 8 rows x 16 steps with labels', () => {
    render(<App />)
    expect(screen.getAllByRole('button', { name: /step \d+, (on|off)/ })).toHaveLength(128)
    expect(screen.getByText('Shaker')).toBeTruthy()
  })

  it('toggles a cell on click', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Kick step 1, off' }))
    const on = screen.getByRole('button', { name: 'Kick step 1, on' })
    expect(on.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(on)
    expect(screen.getByRole('button', { name: 'Kick step 1, off' })).toBeTruthy()
  })

  it('groups steps in fours', () => {
    const { container } = render(<App />)
    expect(container.querySelectorAll('[data-beat="1"]')).toHaveLength(8)
    expect(container.querySelector('[data-beat="1"]')!.querySelectorAll('button')).toHaveLength(4)
  })

  it('Clear empties the grid', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Snare step 5, off' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.queryAllByRole('button', { name: /, on$/ })).toHaveLength(0)
  })
})
