import { PawPrint, Plane, House, Utensils, Coffee, Heart, ShoppingBag, Mountain, TreePalm, Gift, Car, Music, Tent, Beer, TramFront } from 'lucide-react'

export const GROUP_ICONS = {
  paw: PawPrint,
  plane: Plane,
  house: House,
  food: Utensils,
  coffee: Coffee,
  beer: Beer,
  heart: Heart,
  shopping: ShoppingBag,
  mountain: Mountain,
  beach: TreePalm,
  camp: Tent,
  car: Car,
  tram: TramFront,
  gift: Gift,
  music: Music,
}

export const GROUP_COLORS = {
  // 色碼定義在 src/index.css 的 --cs-gi-*，深色模式有另一組
  red:    { bg: 'var(--cs-gi-red-bg)', fg: 'var(--cs-gi-red-fg)' },
  orange: { bg: 'var(--cs-gi-orange-bg)', fg: 'var(--cs-gi-orange-fg)' },
  yellow: { bg: 'var(--cs-gi-yellow-bg)', fg: 'var(--cs-gi-yellow-fg)' },
  green:  { bg: 'var(--cs-gi-green-bg)', fg: 'var(--cs-gi-green-fg)' },
  blue:   { bg: 'var(--cs-gi-blue-bg)', fg: 'var(--cs-gi-blue-fg)' },
  indigo: { bg: 'var(--cs-gi-indigo-bg)', fg: 'var(--cs-gi-indigo-fg)' },
  purple: { bg: 'var(--cs-gi-purple-bg)', fg: 'var(--cs-gi-purple-fg)' },
}

export const DEFAULT_GROUP_ICON = 'paw'
export const DEFAULT_GROUP_COLOR = 'orange'
