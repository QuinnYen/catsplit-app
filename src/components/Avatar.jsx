import { useState } from 'react'

const getInitial = (name) => {
  if (!name) return '🐱'
  const trimmed = name.trim()
  if (!trimmed) return '🐱'
  return Array.from(trimmed)[0].toUpperCase()
}

const Avatar = ({ src, name, size = 38, style, ...rest }) => {
  const [failed, setFailed] = useState(false)
  const showFallback = !src || failed

  const baseStyle = {
    width: size,
    height: size,
    borderRadius: '50%',
    objectFit: 'cover',
    background: '#ffd4b3',
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontWeight: 600,
    fontSize: Math.max(12, size * 0.42),
    overflow: 'hidden',
    ...style,
  }

  if (showFallback) {
    return (
      <div style={baseStyle} aria-label={name || 'avatar'} {...rest}>
        {getInitial(name)}
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={name || 'avatar'}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      style={baseStyle}
      {...rest}
    />
  )
}

export default Avatar
