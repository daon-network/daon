import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KofiButton } from '../src/support/KofiButton'

describe('KofiButton', () => {
  it('renders button variant by default', () => {
    render(<KofiButton />)
    expect(screen.getByText('Support on Ko-fi')).toBeInTheDocument()
  })

  it('renders badge variant', () => {
    render(<KofiButton variant="badge" />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', 'https://ko-fi.com/greenfieldoverride')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('renders minimal variant', () => {
    render(<KofiButton variant="minimal" />)
    expect(screen.getByText('Ko-fi')).toBeInTheDocument()
  })

  it('applies size classes correctly', () => {
    const { rerender } = render(<KofiButton size="small" />)
    expect(screen.getByRole('button')).toHaveClass('px-3', 'py-2', 'text-xs')
    
    rerender(<KofiButton size="medium" />)
    expect(screen.getByRole('button')).toHaveClass('px-4', 'py-2', 'text-sm')
    
    rerender(<KofiButton size="large" />)
    expect(screen.getByRole('button')).toHaveClass('px-6', 'py-3', 'text-base')
  })

  it('applies custom className', () => {
    render(<KofiButton className="custom-class" />)
    expect(screen.getByRole('button')).toHaveClass('custom-class')
  })

  it('opens Ko-fi link on button click', () => {
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    render(<KofiButton />)
    
    screen.getByRole('button').click()
    expect(windowOpenSpy).toHaveBeenCalledWith(
      'https://ko-fi.com/greenfieldoverride',
      '_blank',
      'noopener,noreferrer'
    )
    
    windowOpenSpy.mockRestore()
  })
})
