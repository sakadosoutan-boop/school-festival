// 全角/半角・大文字小文字・ひらがな/カタカナの揺れを吸収して検索する。
// 「かふぇ」で「カフェ」「ｶﾌｪ」が見つからないと、当日の来場者は検索を諦めてしまう。
export function normalizeForSearch(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60))
    .replace(/\s+/g, " ")
    .trim();
}
