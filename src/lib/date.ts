/**
 * Farm-local dates in Asia/Jakarta (WIB, UTC+7).
 *
 * The farm works from dawn. Using the server's UTC date meant any entry logged
 * before 07:00 WIB defaulted to *yesterday* — wrong sale/wage/usage dates, and
 * (for wages) potentially the wrong effective pay rate (app review #17).
 *
 * `todayWIB()` returns YYYY-MM-DD in Jakarta time, suitable for a date input's
 * value. Storage is unchanged: the string is stored as UTC-midnight of that
 * calendar day and displayed back with the same slice, so it round-trips.
 */
export function todayWIB(): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
}

/** Start-of-today in WIB as a Date (UTC instant of 00:00 Jakarta time). */
export function startOfTodayWIB(): Date {
  return new Date(`${todayWIB()}T00:00:00+07:00`);
}
