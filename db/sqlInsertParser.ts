/**
 * Maps an `INSERT INTO table (cols…) VALUES (exprs…)` statement to a column → value object,
 * for the web storage adapter.
 *
 * Each column takes its own expression: a `?` consumes the next parameter, while literals
 * written in the SQL ('SABOTAY', 250, NULL) are kept as they are. The previous adapter
 * consumed parameters by position only, so a literal shifted every following column
 * (the demo carnet got its end date as the price of a hand: « 0 HTG »).
 */
export interface ParsedInsert {
  table: string;
  values: Record<string, unknown>;
}

/** Splits a list on top-level commas, ignoring commas inside quotes or parentheses. */
export function splitTopLevel(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = '';
  for (let i = 0; i < list.length; i++) {
    const ch = list[i];
    if (quote) {
      current += ch;
      if (ch === quote) {
        // '' inside a quoted literal is an escaped quote
        if (list[i + 1] === quote) {
          current += list[++i];
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
    } else if (ch === '(') {
      depth++;
      current += ch;
    } else if (ch === ')') {
      depth--;
      current += ch;
    } else if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/**
 * Text between the parenthesis that opens VALUES (just before `start`) and its matching
 * close, so a trailing `ON CONFLICT … DO UPDATE` clause is left out.
 */
function valuesBody(sql: string, start: number): string | null {
  let depth = 1;
  let quote: string | null = null;
  for (let i = start; i < sql.length; i++) {
    const ch = sql[i];
    if (quote) {
      if (ch === quote) {
        if (sql[i + 1] === quote) i++;
        else quote = null;
      }
    } else if (ch === "'" || ch === '"') {
      quote = ch;
    } else if (ch === '(') {
      depth++;
    } else if (ch === ')' && --depth === 0) {
      return sql.slice(start, i);
    }
  }
  return null;
}

/** Value of one VALUES expression; `next` returns the next bound parameter. */
function evaluate(expr: string, next: () => unknown): unknown {
  if (expr === '?') return next();
  if (/^NULL$/i.test(expr)) return null;
  if (/^'.*'$/s.test(expr)) return expr.slice(1, -1).replace(/''/g, "'");
  if (/^-?\d+(\.\d+)?$/.test(expr)) return Number(expr);
  return expr;
}

/** Returns null when the statement has no explicit column list (positional fallback). */
export function parseInsert(sql: string, params: unknown[] = []): ParsedInsert | null {
  const match = sql.trim().match(/^INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\w+)\s*\(([^)]*)\)\s*VALUES\s*\(/i);
  if (!match) return null;
  const body = valuesBody(sql.trim(), match[0].length);
  if (body === null) return null;
  const columns = splitTopLevel(match[2]).map((c) => c.toLowerCase());
  const expressions = splitTopLevel(body);
  if (columns.length === 0 || columns.length !== expressions.length) return null;

  let index = 0;
  const next = () => params[index++];
  const values: Record<string, unknown> = {};
  columns.forEach((col, i) => {
    values[col] = evaluate(expressions[i], next);
  });
  return { table: match[1].toLowerCase(), values };
}
