import Link from 'next/link';

type ButtonProps = {
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  href?: string;
  children: React.ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className'>;

const base = 'inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-200 cursor-pointer';

const variants = {
  primary: 'bg-gradient-to-r from-primary to-purple-500 text-white shadow-lg shadow-primary/25 hover:opacity-90',
  secondary: 'bg-surface border border-edge text-text hover:bg-surface-alt',
  outline: 'border border-primary text-primary hover:bg-primary/10',
};

const sizes = {
  sm: 'px-4 py-2 text-sm',
  md: 'px-6 py-3 text-sm',
  lg: 'px-8 py-4 text-base',
};

export function Button({ variant = 'primary', size = 'md', href, children, ...props }: ButtonProps) {
  const cls = `${base} ${variants[variant]} ${sizes[size]}`;
  if (href) return <Link href={href} className={cls}>{children}</Link>;
  return <button className={cls} {...props}>{children}</button>;
}
