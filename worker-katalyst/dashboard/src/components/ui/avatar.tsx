import * as React from 'react'
import { cn } from '@/lib/utils'

function Avatar({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('relative flex size-8 shrink-0 overflow-hidden rounded-full', className)} {...props} />
}

function AvatarImage({ className, src, alt = '', ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
  return <img className={cn('aspect-square size-full object-cover', className)} src={src} alt={alt} {...props} />
}

function AvatarFallback({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('flex size-full items-center justify-center rounded-full bg-muted', className)} {...props} />
}

export { Avatar, AvatarImage, AvatarFallback }
