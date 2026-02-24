import { ReactNode, ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Button({
  children,
  variant = 'default',
  size = 'md',
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const variantStyles = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50',
    outline:
      'bg-transparent text-foreground border border-border hover:bg-secondary disabled:opacity-50',
    ghost: 'bg-transparent text-foreground hover:bg-secondary disabled:opacity-50',
  };

  const sizeStyles = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2',
    lg: 'px-6 py-3 text-lg',
  };

  return (
    <button
      className={`inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:cursor-not-allowed ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
