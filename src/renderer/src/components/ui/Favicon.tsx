/** Favicon avec repli élégant (lettre sur pastille teintée). */
import { useState } from 'react'
import { cn, domainOf, hueFromString } from '@/lib/utils'

interface FaviconProps {
  url: string
  faviconUrl: string | null
  size?: number
  className?: string
}

export function Favicon({ url, faviconUrl, size = 14, className }: FaviconProps) {
  const [failed, setFailed] = useState(false)
  const domain = domainOf(url)

  if (faviconUrl && !failed) {
    return (
      <img
        src={faviconUrl}
        width={size}
        height={size}
        draggable={false}
        onError={() => setFailed(true)}
        className={cn('shrink-0 rounded-[3px]', className)}
        alt=""
      />
    )
  }

  const hue = hueFromString(domain)
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-[3px] font-medium uppercase',
        className
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(7, size * 0.55),
        background: `hsl(${hue} 30% 22%)`,
        color: `hsl(${hue} 50% 78%)`
      }}
    >
      {domain.charAt(0) || '?'}
    </span>
  )
}
