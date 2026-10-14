import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import App from './App'

beforeEach(() => window.history.replaceState(null, '', '/'))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

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

describe('share link', () => {
  it('updates the URL as the pattern changes, without reloading', () => {
    render(<App />)
    const before = window.location.hash
    fireEvent.click(screen.getByRole('button', { name: 'Kick step 1, off' }))
    expect(window.location.hash).not.toBe(before)
    fireEvent.change(screen.getByLabelText('Swing'), { target: { value: '50' } })
    expect(window.location.hash).toContain('s=50')
  })

  it('restores the exact state from the URL', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Snare step 5, off' }))
    fireEvent.change(screen.getByLabelText('Tempo slider'), { target: { value: '99' } })
    fireEvent.change(screen.getByLabelText('Swing'), { target: { value: '30' } })
    fireEvent.change(screen.getByLabelText('Kick volume'), { target: { value: '0' } })
    const url = window.location.href
    cleanup()
    window.history.replaceState(null, '', '/')
    window.history.replaceState(null, '', url)
    render(<App />)
    expect(screen.getByRole('button', { name: 'Snare step 5, on' })).toBeTruthy()
    expect((screen.getByLabelText('Tempo (BPM)') as HTMLInputElement).value).toBe('99')
    expect(screen.getByTestId('swing-value').textContent).toBe('30%')
    expect(screen.getByLabelText('Kick volume').getAttribute('aria-valuetext')).toBe('muted')
  })

  it('falls back to defaults on a malformed URL', () => {
    window.history.replaceState(null, '', '/#p=zzzz&t=9999')
    render(<App />)
    expect(screen.queryAllByRole('button', { name: /, on$/ })).toHaveLength(0)
    expect((screen.getByLabelText('Tempo (BPM)') as HTMLInputElement).value).toBe('120')
  })

  it('copies the link and confirms', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    expect(await screen.findByText('Link copied.')).toBeTruthy()
    expect(writeText).toHaveBeenCalledWith(window.location.href)
  })

  it('shows the link for manual copying when the clipboard is unavailable', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined })
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    const field = (await screen.findByLabelText('Copy this link yourself:')) as HTMLInputElement
    expect(field.value).toBe(window.location.href)
    expect(screen.queryByText('Link copied.')).toBeNull()
  })
})

describe('starter patterns', () => {
  it('loads a starter into the grid, tempo, swing and URL, and it stays editable', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'House' }))
    expect(screen.getByRole('button', { name: 'Kick step 5, on' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Kick step 2, off' })).toBeTruthy()
    expect((screen.getByLabelText('Tempo (BPM)') as HTMLInputElement).value).toBe('124')
    expect(window.location.hash).toContain('t=124')
    fireEvent.click(screen.getByRole('button', { name: 'Kick step 2, off' }))
    expect(screen.getByRole('button', { name: 'Kick step 2, on' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Hip hop' }))
    expect((screen.getByLabelText('Tempo (BPM)') as HTMLInputElement).value).toBe('90')
    expect(screen.getByTestId('swing-value').textContent).toBe('30%')
    expect(window.location.hash).toContain('t=90')
  })

  it('offers all six starters', () => {
    render(<App />)
    for (const n of ['House', 'Hip hop', 'Techno', 'Breakbeat', 'Reggaeton', 'Half-time'])
      expect(screen.getByRole('button', { name: n })).toBeTruthy()
  })
})

describe('keyboard', () => {
  const space = () => new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true })

  it('Space toggles play from the page (no audio in jsdom, so it reports that)', async () => {
    render(<App />)
    const ev = space()
    document.body.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
    expect(await screen.findByRole('alert')).toBeTruthy()
  })

  it('Space does nothing in text fields', () => {
    render(<App />)
    const ev = space()
    screen.getByLabelText('Tempo (BPM)').dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(false)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('Space on a plain button keeps its normal meaning', () => {
    render(<App />)
    const ev = space()
    screen.getByRole('button', { name: 'Clear' }).dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(false)
  })

  it('cells are focusable buttons that toggle', () => {
    render(<App />)
    const cell = screen.getByRole('button', { name: 'Kick step 1, off' }) as HTMLButtonElement
    expect(cell.tabIndex).toBe(0)
    cell.focus()
    expect(document.activeElement).toBe(cell)
    fireEvent.click(cell) // Enter on a focused button fires click
    expect(screen.getByRole('button', { name: 'Kick step 1, on' })).toBeTruthy()
  })

  it('arrow keys move focus between cells and stop at the edges', () => {
    render(<App />)
    const start = screen.getByRole('button', { name: 'Kick step 1, off' })
    start.focus()
    fireEvent.keyDown(start, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Kick step 2, off' }))
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Snare step 2, off' }))
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' })
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Snare step 1, off' }))
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' })
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Kick step 1, off' }))
  })
})
