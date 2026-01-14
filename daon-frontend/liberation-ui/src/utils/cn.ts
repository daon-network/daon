import { clsx, type ClassValue } from 'clsx';

/**
 * Utility function for combining class names
 * Perfect for conditional Tailwind classes in Liberation components
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}