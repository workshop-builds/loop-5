import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import App from './App'
import { milestones } from './plan'

afterEach(cleanup)

describe('project page', () => {
  it('shows the project name and what it will be', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Loop Lab')
    expect(screen.getByText(/16-step drum machine/)).toBeTruthy()
  })

  it('lists every milestone of the plan in order', () => {
    render(<App />)
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(6)
    milestones.forEach((m, i) => {
      expect(items[i].textContent).toContain(`Milestone ${i + 1}: ${m.title}`)
    })
  })
})
