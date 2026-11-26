// 計算機的「捷徑」（免稅、刷卡、服務費、外加稅、小費、自訂）：由設定組出清單、再依開啟的捷徑組出 computePay 的參數。純函式。
// 清單項目：{ id, kind: 'taxFree' | 'card' | 'extra', labelKey?（i18n key，內建的）, name?（自訂的名稱）, percent, sign: 1 | -1, visible }
// visible：要不要出現在計算機的捷徑列（設定頁的開關）；隱藏的捷徑不參與計算。
// 順序就是鈕的順序：刷卡、免稅、服務費、外加稅、小費，再來是自訂。

export const shortcutList = (settings) => [
  { id: 'card', kind: 'card', labelKey: 'fx.calc.card', percent: settings.cardFeePercent, sign: 1, visible: settings.showShortcuts.card },
  { id: 'taxFree', kind: 'taxFree', labelKey: 'fx.calc.taxFree', percent: settings.taxFreePercent, sign: -1, visible: settings.showShortcuts.taxFree },
  { id: 'service', kind: 'extra', labelKey: 'fx.calc.service', percent: settings.serviceFeePercent, sign: 1, visible: settings.showShortcuts.service },
  { id: 'addTax', kind: 'extra', labelKey: 'fx.calc.addTax', percent: settings.addTaxPercent, sign: 1, visible: settings.showShortcuts.addTax },
  { id: 'tip', kind: 'extra', labelKey: 'fx.calc.tip', percent: settings.tipPercent, sign: 1, visible: settings.showShortcuts.tip },
  ...settings.customShortcuts.map((c) => ({ id: `c:${c.id}`, kind: 'extra', name: c.name, percent: c.percent, sign: c.kind === 'deduct' ? -1 : 1, visible: c.visible !== false })),
]

// on：開啟的捷徑 id 的 Set（隱藏的捷徑即使在 on 裡也不算）。回傳 computePay 要的 { taxFree, taxPercent, card, cardPercent, extras }
export const payParams = (list, onRaw) => {
  const on = activeSet(list, onRaw)
  const byId = Object.fromEntries(list.map((x) => [x.id, x]))
  return {
    taxFree: on.has('taxFree'), taxPercent: byId.taxFree.percent,
    card: on.has('card'), cardPercent: byId.card.percent,
    extras: list.filter((x) => x.kind === 'extra' && on.has(x.id)).map((x) => ({ key: x.id, percent: x.sign * x.percent })),
  }
}

// 開著而且顯示中的捷徑（已刪除或被隱藏的捷徑 id 留在 on 裡不算）
export const activeSet = (list, on) => new Set(list.filter((x) => x.visible && on.has(x.id)).map((x) => x.id))

export const anyOn = (list, on) => activeSet(list, on).size > 0
