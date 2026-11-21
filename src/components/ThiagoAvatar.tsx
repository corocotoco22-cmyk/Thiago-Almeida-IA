import { useState } from 'react';
import { THIAGO_AVATAR_URL } from '../types/chat';

interface ThiagoAvatarProps {
  size?: 'sm' | 'lg';
}

export function ThiagoAvatar({ size = 'sm' }: ThiagoAvatarProps) {
  const [hasError, setHasError] = useState(false);

  const dimensions =
    size === 'lg' ? 'h-20 w-20 text-xl' : 'h-8 w-8 text-xs';
  const radius = size === 'lg' ? 'rounded-2xl' : 'rounded-lg';

  if (hasError) {
    return (
      <div
        aria-label="Thiago Almeida"
        className={`${dimensions} ${radius} shrink-0 flex items-center justify-center bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-display font-bold select-none`}
      >
        TA
      </div>
    );
  }

  return (
    <img
      src={THIAGO_AVATAR_URL}
      alt="Retrato de Thiago Almeida"
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
      className={`${dimensions} ${radius} shrink-0 object-cover border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800`}
    />
  );
}
