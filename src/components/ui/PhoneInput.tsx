import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ChevronDown, Search, Check, Phone } from 'lucide-react';
import { COUNTRY_CODES, CountryCode, DEFAULT_COUNTRY, parsePhoneNumber, formatToE164 } from '../../utils/countryCodes';
import { cn } from '@/lib/utils';

export interface PhoneInputProps {
  value?: string;
  onChange: (fullE164Phone: string, meta?: { country: CountryCode; nationalNumber: string }) => void;
  defaultCountryCode?: string;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  buttonClassName?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  autoFocus?: boolean;
  size?: 'default' | 'lg';
}

export const PhoneInput: React.FC<PhoneInputProps> = ({
  value = '',
  onChange,
  defaultCountryCode = 'EG',
  placeholder,
  className,
  inputClassName,
  buttonClassName,
  disabled = false,
  required = false,
  id,
  autoFocus = false,
  size = 'default'
}) => {
  // Parse initial value
  const initial = useMemo(() => parsePhoneNumber(value, defaultCountryCode), [value, defaultCountryCode]);
  
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>(initial.country);
  const [nationalNumber, setNationalNumber] = useState<string>(initial.nationalNumber);
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const numberInputRef = useRef<HTMLInputElement>(null);

  // Sync state if external value changes significantly
  useEffect(() => {
    if (!value) {
      setNationalNumber('');
      return;
    }
    const parsed = parsePhoneNumber(value, selectedCountry.code);
    if (parsed.country.code !== selectedCountry.code) {
      setSelectedCountry(parsed.country);
    }
    if (parsed.nationalNumber !== nationalNumber) {
      setNationalNumber(parsed.nationalNumber);
    }
  }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    const handlePointerDownOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handlePointerDownOutside);
      // Auto-focus search input when opened
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
    return () => {
      document.removeEventListener('mousedown', handlePointerDownOutside);
    };
  }, [isOpen]);

  // Filtered countries
  const filteredCountries = useMemo(() => {
    if (!searchQuery.trim()) return COUNTRY_CODES;
    const q = searchQuery.toLowerCase().trim();
    return COUNTRY_CODES.filter(c => 
      c.name.toLowerCase().includes(q) ||
      c.dialCode.includes(q) ||
      c.code.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const priorityCountries = useMemo(() => {
    if (searchQuery.trim()) return [];
    return COUNTRY_CODES.filter(c => c.priority !== undefined).sort((a, b) => (a.priority || 99) - (b.priority || 99));
  }, [searchQuery]);

  const handleCountrySelect = (country: CountryCode) => {
    setSelectedCountry(country);
    setIsOpen(false);
    setSearchQuery('');

    // Emit updated phone with new country code
    const fullPhone = formatToE164(country, nationalNumber);
    onChange(fullPhone, { country, nationalNumber });

    // Focus back on number input
    setTimeout(() => numberInputRef.current?.focus(), 50);
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value;

    // Detect if user pasted a full international string starting with + or 00
    if (raw.startsWith('+') || raw.startsWith('00')) {
      const parsed = parsePhoneNumber(raw, selectedCountry.code);
      setSelectedCountry(parsed.country);
      setNationalNumber(parsed.nationalNumber);
      const fullPhone = formatToE164(parsed.country, parsed.nationalNumber);
      onChange(fullPhone, { country: parsed.country, nationalNumber: parsed.nationalNumber });
      return;
    }

    // Strip non-digits except spaces/dashes
    let digits = raw.replace(/\D/g, '');

    // Auto-strip leading local trunk zero (e.g. typing 010 -> 10 when Egypt +20 is selected)
    if (digits.startsWith('0') && (selectedCountry.code === 'EG' || selectedCountry.code === 'SA' || selectedCountry.code === 'GB' || selectedCountry.code === 'AE')) {
      digits = digits.replace(/^0+/, '');
    }

    setNationalNumber(digits);

    const fullPhone = formatToE164(selectedCountry, digits);
    onChange(fullPhone, { country: selectedCountry, nationalNumber: digits });
  };

  const isLarge = size === 'lg';

  return (
    <div ref={containerRef} className={cn("relative flex w-full items-center", className)}>
      {/* Country Selector Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-1.5 rounded-l-xl border border-r-0 border-input bg-muted/30 px-3 transition-colors hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0 select-none",
          isLarge ? "h-14 text-base px-4 rounded-l-2xl" : "h-10 text-sm",
          disabled && "cursor-not-allowed opacity-50",
          buttonClassName
        )}
        title={`${selectedCountry.name} (${selectedCountry.dialCode})`}
        aria-label="Select Country Code"
      >
        <span className={cn("text-base leading-none", isLarge && "text-xl")}>{selectedCountry.flag}</span>
        <span className={cn("font-mono font-medium text-foreground tracking-tight", isLarge ? "text-sm font-semibold" : "text-xs")}>
          {selectedCountry.dialCode}
        </span>
        <ChevronDown className={cn("text-muted-foreground opacity-60 transition-transform", isOpen && "rotate-180", isLarge ? "h-4 w-4" : "h-3.5 w-3.5")} />
      </button>

      {/* National Number Input */}
      <input
        ref={numberInputRef}
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        disabled={disabled}
        required={required}
        autoFocus={autoFocus}
        value={nationalNumber}
        onChange={handleNumberChange}
        placeholder={placeholder || (selectedCountry.sample ? `e.g. ${selectedCountry.sample}` : 'Phone number')}
        className={cn(
          "w-full rounded-r-xl border border-input bg-background/50 px-3.5 text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-all font-mono",
          isLarge ? "h-14 text-base px-5 rounded-r-2xl" : "h-10 text-sm",
          disabled && "cursor-not-allowed opacity-50 bg-muted/20",
          inputClassName
        )}
      />

      {/* Searchable Country Popover */}
      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-80 max-w-[90vw] rounded-xl border border-border bg-popover/95 p-2 shadow-2xl backdrop-blur-xl animate-in fade-in-0 zoom-in-95 duration-100">
          {/* Search Header */}
          <div className="relative mb-2 px-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search country or code..."
              className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-3 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground"
            />
          </div>

          {/* List of Countries */}
          <div className="max-h-60 overflow-y-auto space-y-0.5 overscroll-contain pr-1">
            {/* Priority Regional Countries */}
            {priorityCountries.length > 0 && (
              <>
                <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Frequent Regions
                </div>
                {priorityCountries.map(country => {
                  const isSelected = country.code === selectedCountry.code;
                  return (
                    <button
                      key={`prio-${country.code}`}
                      type="button"
                      onClick={() => handleCountrySelect(country)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors hover:bg-accent hover:text-accent-foreground text-left",
                        isSelected && "bg-primary/10 text-primary font-medium"
                      )}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <span className="text-base leading-none">{country.flag}</span>
                        <span className="truncate">{country.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-[11px] text-muted-foreground">{country.dialCode}</span>
                        {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
                      </div>
                    </button>
                  );
                })}
                <div className="my-1.5 border-t border-border/50" />
                <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  All Countries
                </div>
              </>
            )}

            {/* Filtered Countries */}
            {filteredCountries.map(country => {
              const isSelected = country.code === selectedCountry.code;
              return (
                <button
                  key={country.code}
                  type="button"
                  onClick={() => handleCountrySelect(country)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors hover:bg-accent hover:text-accent-foreground text-left",
                    isSelected && "bg-primary/10 text-primary font-medium"
                  )}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <span className="text-base leading-none">{country.flag}</span>
                    <span className="truncate">{country.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono text-[11px] text-muted-foreground">{country.dialCode}</span>
                    {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
                  </div>
                </button>
              );
            })}

            {filteredCountries.length === 0 && (
              <div className="py-4 text-center text-xs text-muted-foreground">
                No countries found for "{searchQuery}"
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PhoneInput;
