import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { LibIcon } from '../src/icons/LibIcon'

describe('LibIcon', () => {
  it('renders a Freedom icon', () => {
    const { container } = render(<LibIcon icon="Freedom" />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('renders with correct size', () => {
    const { container } = render(<LibIcon icon="Growth" size="lg" />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('width', '24')
    expect(svg).toHaveAttribute('height', '24')
  })

  it('applies custom className', () => {
    const { container } = render(<LibIcon icon="Progress" className="custom-class" />)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper).toHaveClass('custom-class')
  })

  it('renders with animation', () => {
    const { container } = render(<LibIcon icon="Focus" animation="pulse" />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveClass('animate-pulse')
  })

  it('renders all core liberation icons', () => {
    const icons = [
      'Freedom', 'Growth', 'Progress', 'Focus', 'Privacy',
      'Wellbeing', 'Mind', 'Energy', 'Direction', 'NewBeginning'
    ]

    icons.forEach(icon => {
      const { container } = render(<LibIcon icon={icon as any} />)
      expect(container.querySelector('svg')).toBeInTheDocument()
    })
  })

  it('shows placeholder for invalid icon', () => {
    const { container } = render(<LibIcon icon="InvalidIcon" as any />)
    const placeholder = container.querySelector('div')
    expect(placeholder).toHaveClass('bg-gray-200')
  })
})
