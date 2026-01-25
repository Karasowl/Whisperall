import { cn } from '@/lib/utils';

interface SliderProps {
    label?: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (value: number) => void;
    disabled?: boolean;
    description?: string;
    className?: string;
    showValue?: boolean;
}

export function Slider({
    label,
    value,
    min,
    max,
    step,
    onChange,
    disabled,
    description,
    className,
    showValue = true,
}: SliderProps) {
    return (
        <div className={cn('space-y-2', disabled && 'opacity-50', className)}>
            {(label || showValue) && (
                <div className="flex justify-between items-center">
                    {label && <label className="text-sm font-medium text-foreground">{label}</label>}
                    {showValue && (
                        <span className="text-sm font-mono text-accent-primary bg-accent-primary/10 px-2 py-0.5 rounded">
                            {(value ?? 0).toFixed(step < 1 ? 2 : 0)}
                        </span>
                    )}
                </div>
            )}
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value ?? min}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                disabled={disabled}
                className="slider w-full accent-accent-primary"
            />
            {description && <p className="text-xs text-foreground-muted">{description}</p>}
        </div>
    );
}
