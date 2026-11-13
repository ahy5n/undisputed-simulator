export function dateForWeek(startDate: string, week: number): Date {
  const d = new Date(startDate + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + week * 7);
  return d;
}
export function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
export function gameYear(startDate: string, week: number): number {
  return dateForWeek(startDate, week).getUTCFullYear();
}
