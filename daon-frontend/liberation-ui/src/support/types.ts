export interface KofiButtonProps {
  size?: KofiButtonSize;
  variant?: KofiButtonVariant;
  className?: string;
}

export type KofiButtonSize = 'small' | 'medium' | 'large';
export type KofiButtonVariant = 'button' | 'badge' | 'minimal';