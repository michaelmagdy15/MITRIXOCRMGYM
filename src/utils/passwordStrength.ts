// Password strength utility — no external library needed
export interface PasswordStrengthResult {
  score: 0 | 1 | 2 | 3 | 4;
  label: 'Too short' | 'Weak' | 'Fair' | 'Good' | 'Strong';
  color: string;       // Tailwind bg colour class
  textColor: string;   // Tailwind text colour class
  percent: number;     // 0-100 for progress bar
}

export function getPasswordStrength(pwd: string): PasswordStrengthResult {
  if (pwd.length < 6) {
    return { score: 0, label: 'Too short', color: 'bg-zinc-300 dark:bg-zinc-700', textColor: 'text-zinc-500', percent: 0 };
  }

  let score = 0;
  if (pwd.length >= 8)  score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;

  // Map 0-5 score to 1-4
  const clamped = Math.min(4, Math.max(1, Math.ceil(score / 1.25))) as 1 | 2 | 3 | 4;

  const map: Record<1 | 2 | 3 | 4, Omit<PasswordStrengthResult, 'score'>> = {
    1: { label: 'Weak',   color: 'bg-red-500',    textColor: 'text-red-500',    percent: 25  },
    2: { label: 'Fair',   color: 'bg-amber-400',  textColor: 'text-amber-500',  percent: 50  },
    3: { label: 'Good',   color: 'bg-blue-500',   textColor: 'text-blue-500',   percent: 75  },
    4: { label: 'Strong', color: 'bg-emerald-500',textColor: 'text-emerald-600',percent: 100 },
  };

  return { score: clamped, ...map[clamped] };
}

export const DEFAULT_PASSWORD = '12345678';

/** Validation rules for a new password */
export function validateNewPassword(pwd: string, confirm: string): string | null {
  if (pwd.length < 8)             return 'Password must be at least 8 characters.';
  if (pwd === DEFAULT_PASSWORD)   return 'You cannot use "12345678" as your new password.';
  if (!/[A-Z]/.test(pwd))         return 'Must include at least one uppercase letter.';
  if (!/[0-9]/.test(pwd))         return 'Must include at least one number.';
  if (!/[^A-Za-z0-9]/.test(pwd)) return 'Must include at least one special character (e.g. @, #, !).';
  if (pwd !== confirm)            return 'Passwords do not match.';
  return null;
}
