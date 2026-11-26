// 計算機的「捷徑」（免稅、刷卡、服務費、外加稅、小費、自訂）：由設定組出清單、再依開啟的捷徑組出 computePay 的參數。純函式。
// 清單項目：{ id, kind: 'taxFree' | 'card' | 'extra', labelKey?（i18n key，內建的）, name?（自訂的名稱）, percent, sign: 1 | -1 }
// 順序就是鈕的順序：刷卡、免稅、服務費、外加稅、小費，再來是自訂。

export const shortcutList = (settings) => [
  { id: 'card', kind: 'card', labelKey: 'fx.calc.card', percent: settings.cardFeePercent, sign: 1 },
  { id: 'taxFree', kind: 'taxFree', labelKey: 'fx.calc.taxFree', percent: settings.taxFreePercent, sign: -1 },
  { id: 'service', kind: 'extra', labelKey: 'fx.calc.service', percent: settings.serviceFeePercent, sign: 1 },
  { id: 'addTax', kind: 'extra', labelKey: 'fx.calc.addTax', percent: settings.addTaxPercent, sign: 1 },
  { id: 'tip', kind: 'extra', labelKey: 'fx.calc.tip', percent: settings.tipPercent, sign: 1 },
  ...settings.customShortcuts.map((c) => ({ id: `c:${c.id}`, kind: 'extra', name: c.name, percent: c.percent, sign: c.kind === 'deduct' ? -1 : 1 })),
]

// on：開啟的捷徑 id 的 Set。回傳 computePay 要的 { taxFree, taxPercent, card, cardPercent, extras }
export const payParams = (list, on) => {
  const byId = Object.fromEntries(list.map((x) => [x.id, x]))
  return {
    taxFree: on.has('taxFree'), taxPercent: byId.taxFree.percent,
    card: on.has('card'), cardPercent: byId.card.percent,
    extras: list.filter((x) => x.kind === 'extra' && on.has(x.id)).map((x) => ({ key: x.id, percent: x.sign * x.percent })),
  }
}

// 這個清單裡有沒有任何捷徑開著（已刪除的自訂捷徑 id 留在 on 裡不算）
export const anyOn = (list, on) => list.some((x) => on.has(x.id))
