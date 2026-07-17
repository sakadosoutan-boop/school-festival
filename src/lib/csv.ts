export type CsvRow = Record<string, string>;

export function parseCsv(text: string): CsvRow[] {
  const source = text.replace(/^\uFEFF/, "");
  const matrix: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field.trim());
      field = "";
    } else if (char === "\n") {
      row.push(field.trim());
      matrix.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (quoted) throw new Error("CSVの引用符が閉じられていません。");
  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    matrix.push(row);
  }

  const nonEmpty = matrix.filter((cells) => cells.some((cell) => cell !== ""));
  const headers = nonEmpty[0]?.map((header) => header.trim()) ?? [];
  if (headers.length === 0) return [];
  if (new Set(headers).size !== headers.length) throw new Error("CSVの見出しが重複しています。");

  return nonEmpty.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])));
}

function quote(value: unknown): string {
  const stringValue = String(value ?? "");
  if (/[",\r\n]/.test(stringValue)) return `"${stringValue.replaceAll('"', '""')}"`;
  return stringValue;
}

export function toCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
  const lines = [headers.map(quote).join(",")];
  for (const row of rows) lines.push(headers.map((header) => quote(row[header])).join(","));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function downloadText(filename: string, content: string, type = "text/plain;charset=utf-8"): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
