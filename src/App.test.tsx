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

  it('shows Tap to start before the first gesture, and Play', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: 'Tap to start' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy()
  })

  it('reports missing audio without crashing', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
  })

  it('shows tempo as a number and clamps it', () => {
    render(<App />)
    const tempo = screen.getByLabelText('Tempo (BPM)') as HTMLInputElement
    expect(tempo.value).toBe('120')
    fireEvent.change(tempo, { target: { value: '300' } })
    fireEvent.blur(tempo)
    expect(tempo.value).toBe('180')
    fireEvent.change(tempo, { target: { value: '20' } })
    fireEvent.blur(tempo)
    expect(tempo.value).toBe('60')
    fireEvent.change(tempo, { target: { value: '95' } })
    expect(tempo.value).toBe('95')
    expect((screen.getByLabelText('Tempo slider') as HTMLInputElement).value).toBe('95')
  })

  it('has a swing control from 0% up', () => {
    render(<App />)
    const swing = screen.getByLabelText('Swing') as HTMLInputElement
    expect(screen.getByTestId('swing-value').textContent).toBe('0%')
    fireEvent.change(swing, { target: { value: '50' } })
    expect(screen.getByTestId('swing-value').textContent).toBe('50%')
    expect(Number(swing.max)).toBe(75)
  })

  it('has a volume slider per row, down to mute', () => {
    render(<App />)
    expect(screen.getAllByRole('slider', { name: / volume$/ })).toHaveLength(8)
    const kick = screen.getByLabelText('Kick volume') as HTMLInputElement
    expect(kick.min).toBe('0')
    fireEvent.change(kick, { target: { value: '0' } })
    expect(kick.getAttribute('aria-valuetext')).toBe('muted')
    fireEvent.change(kick, { target: { value: '40' } })
    expect(kick.getAttribute('aria-valuetext')).toBe('40%')
  })

  it('Clear empties the grid', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Snare step 5, off' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.queryAllByRole('button', { name: /, on$/ })).toHaveLength(0)
  })
})
