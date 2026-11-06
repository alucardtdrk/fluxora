export const BRAZIL_TIME_ZONE = "America/Sao_Paulo";

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BRAZIL_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function brazilDateKey(date = new Date()) {
  return dateFormatter.format(date);
}

export function startOfBrazilDay(date = new Date()) {
  // Brasília has used UTC-03:00 year-round since daylight saving ended in 2019.
  return new Date(`${brazilDateKey(date)}T00:00:00-03:00`);
}
