'use client'

import React from 'react'

export function cleanPhoneNumber(phone?: string | null): string {
  if (!phone) return ''
  return phone.replace(/\D/g, '')
}

export function buildWhatsAppUrl(phone?: string | null, message?: string | null): string | null {
  const digits = cleanPhoneNumber(phone)
  if (!digits) return null
  const base = `https://wa.me/${digits}`
  return message ? `${base}?text=${encodeURIComponent(message)}` : base
}

export function WhatsAppIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={`${className} fill-current shrink-0`} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2ZM12.05 20.16C10.56 20.16 9.11 19.76 7.85 19.01L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.99 3.8 13.47 3.8 11.91C3.8 7.37 7.5 3.67 12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.16 12.05 20.16ZM16.56 14.39C16.31 14.27 15.09 13.67 14.86 13.58C14.64 13.5 14.47 13.46 14.31 13.71C14.15 13.96 13.68 14.51 13.54 14.67C13.4 14.84 13.26 14.86 13.01 14.73C12.76 14.61 11.96 14.35 11.01 13.5C10.27 12.84 9.77 12.03 9.63 11.78C9.49 11.53 9.61 11.4 9.74 11.27C9.85 11.16 9.99 10.98 10.11 10.84C10.23 10.7 10.28 10.59 10.36 10.43C10.44 10.26 10.4 10.12 10.34 10C10.28 9.88 9.79 8.67 9.58 8.18C9.39 7.69 9.18 7.76 9.03 7.75C8.89 7.74 8.72 7.74 8.56 7.74C8.39 7.74 8.12 7.8 7.89 8.05C7.66 8.3 7.02 8.9 7.02 10.12C7.02 11.34 7.91 12.51 8.03 12.68C8.16 12.84 9.78 15.34 12.26 16.41C12.85 16.66 13.31 16.82 13.67 16.93C14.26 17.12 14.8 17.09 15.22 17.03C15.7 16.96 16.69 16.43 16.9 15.84C17.11 15.26 17.11 14.76 17.04 14.65C16.98 14.54 16.81 14.49 16.56 14.39Z"/>
    </svg>
  )
}

interface WhatsAppButtonProps {
  phone?: string | null
  driverName?: string
  message?: string
  variant?: 'badge' | 'button' | 'icon'
  className?: string
  label?: string
}

export default function WhatsAppButton({
  phone,
  driverName,
  message,
  variant = 'badge',
  className = '',
  label
}: WhatsAppButtonProps) {
  const url = buildWhatsAppUrl(phone, message)
  if (!url) return null

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Crucial: stop propagation so clicking WhatsApp doesn't trigger card selection or form submit
    e.stopPropagation()
  }

  const tooltip = driverName ? `Chat with ${driverName} on WhatsApp` : 'Chat on WhatsApp'

  if (variant === 'icon') {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
        title={tooltip}
        className={`inline-flex items-center justify-center p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500 text-emerald-600 hover:text-white border border-emerald-500/20 transition-all shadow-sm active:scale-95 ${className}`}
      >
        <WhatsAppIcon className="w-3.5 h-3.5" />
      </a>
    )
  }

  if (variant === 'button') {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
        title={tooltip}
        className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white transition-all shadow-sm hover:shadow active:scale-95 ${className}`}
      >
        <WhatsAppIcon className="w-3.5 h-3.5" />
        <span>{label || 'WhatsApp'}</span>
      </a>
    )
  }

  // Default: 'badge'
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      title={tooltip}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white transition-all shadow-sm active:scale-95 ${className}`}
    >
      <WhatsAppIcon className="w-3 h-3" />
      <span>{label || 'WhatsApp'}</span>
    </a>
  )
}
