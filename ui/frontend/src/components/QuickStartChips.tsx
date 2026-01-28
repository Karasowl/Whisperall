'use client';

import {
  BookOpen,
  Smile,
  Megaphone,
  Globe,
  Film,
  Gamepad2,
  Mic2,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const suggestions = [
  {
    icon: BookOpen,
    label: 'Narrate a story',
    text: 'Once upon a time, in a land far away, there lived a curious young explorer who dreamed of discovering the secrets hidden beyond the mountains.',
  },
  {
    icon: Smile,
    label: 'Tell a silly joke',
    text: 'Why don\'t scientists trust atoms? Because they make up everything! But seriously, have you heard about the mathematician who\'s afraid of negative numbers? He\'ll stop at nothing to avoid them!',
  },
  {
    icon: Megaphone,
    label: 'Record an advertisement',
    text: 'Introducing the revolutionary new way to experience your morning coffee! Our premium blend combines the finest beans with cutting-edge technology to deliver the perfect cup, every single time.',
  },
  {
    icon: Globe,
    label: 'Speak in different languages',
    text: 'Hello, world! Bonjour le monde! ¡Hola mundo! Hallo Welt! Ciao mondo! The beauty of language connects us all, bridging cultures and bringing people together.',
  },
  {
    icon: Film,
    label: 'Direct a dramatic movie scene',
    text: 'The rain poured down as she stood at the edge of the cliff, the wind howling around her. "I won\'t let you go," he shouted over the storm. "Not this time. Not ever again."',
  },
  {
    icon: Gamepad2,
    label: 'Hear from a video game character',
    text: 'Greetings, adventurer! Your quest awaits you in the Shadowlands. Gather your courage, sharpen your blade, and remember: the fate of the kingdom rests upon your shoulders!',
  },
  {
    icon: Mic2,
    label: 'Introduce your podcast',
    text: 'Welcome back to another episode! I\'m your host, and today we\'re diving deep into a topic that\'s been on everyone\'s mind. Grab your headphones, settle in, and let\'s get started!',
  },
  {
    icon: Sparkles,
    label: 'Guide a meditation class',
    text: 'Take a deep breath in... and slowly release. Feel the tension leaving your body as you sink deeper into relaxation. With each breath, you become more peaceful, more present, more at ease.',
  },
];

interface QuickStartChipsProps {
  onSelect: (text: string) => void;
  className?: string;
}

export function QuickStartChips({ onSelect, className }: QuickStartChipsProps) {
  return (
    <div className={cn("space-y-3", className)}>
      <p className="text-sm text-foreground-muted">Get started with</p>
      <div className="flex flex-wrap gap-2">
        {suggestions.map(({ icon: Icon, label, text }) => (
          <button
            key={label}
            onClick={() => onSelect(text)}
            className="chip"
          >
            <Icon className="chip-icon" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
