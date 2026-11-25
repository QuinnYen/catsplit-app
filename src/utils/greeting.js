// 依時段隨機挑一句問候（圖示加 i18n key），入口頁與分帳列表共用。
import { Moon, Cat, BedDouble, Sun, PawPrint, Coffee, Utensils, Fish, Cookie, CloudSun, Sunset, Soup } from 'lucide-react'

const GREETINGS = [
  // 0-4 深夜
  [{ Icon: Moon, key: 'greeting.n1' }, { Icon: Cat, key: 'greeting.n2' }, { Icon: BedDouble, key: 'greeting.n3' }],
  // 5-10 早上
  [{ Icon: Sun, key: 'greeting.m1' }, { Icon: PawPrint, key: 'greeting.m2' }, { Icon: Coffee, key: 'greeting.m3' }],
  // 11-13 中午
  [{ Icon: Utensils, key: 'greeting.d1' }, { Icon: Fish, key: 'greeting.d2' }, { Icon: PawPrint, key: 'greeting.d3' }],
  // 14-17 下午
  [{ Icon: Cookie, key: 'greeting.a1' }, { Icon: CloudSun, key: 'greeting.a2' }, { Icon: Coffee, key: 'greeting.a3' }],
  // 18-21 晚上
  [{ Icon: Sunset, key: 'greeting.e1' }, { Icon: Soup, key: 'greeting.e2' }, { Icon: PawPrint, key: 'greeting.e3' }],
  // 22-23 夜晚
  [{ Icon: Moon, key: 'greeting.l1' }, { Icon: BedDouble, key: 'greeting.l2' }, { Icon: Cat, key: 'greeting.l3' }],
]

export const getGreeting = () => {
  const h = new Date().getHours()
  const bucket = h < 5 ? 0 : h < 11 ? 1 : h < 14 ? 2 : h < 18 ? 3 : h < 22 ? 4 : 5
  const options = GREETINGS[bucket]
  return options[Math.floor(Math.random() * options.length)]
}
