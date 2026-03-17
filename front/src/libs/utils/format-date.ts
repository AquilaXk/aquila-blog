export const formatDate = (
  input: string | number | Date,
  lang: string = "en-US",
  timeZone: string = "Asia/Seoul"
): string => {
  if (!input) return ""

  try {
    const date = input instanceof Date ? input : new Date(input)

    if (isNaN(date.getTime())) {
      return ""
    }

    const options: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone,
    }

    return date.toLocaleDateString(lang, options)
  } catch {
    return ""
  }
}

const toDate = (input: string | number | Date): Date | null => {
  if (!input) return null

  try {
    const date = input instanceof Date ? input : new Date(input)
    if (Number.isNaN(date.getTime())) return null
    return date
  } catch {
    return null
  }
}

const toParts = (
  input: string | number | Date,
  lang: string,
  timeZone: string
) => {
  const date = toDate(input)
  if (!date) return null

  const formatter = new Intl.DateTimeFormat(lang, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  })

  const parts = formatter.formatToParts(date)
  const lookup = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || ""

  return {
    year: lookup("year"),
    month: lookup("month"),
    day: lookup("day"),
    hour: lookup("hour"),
    minute: lookup("minute"),
  }
}

export const formatDateTime = (
  input: string | number | Date,
  lang: string = "ko-KR",
  timeZone: string = "Asia/Seoul"
): string => {
  const parts = toParts(input, lang, timeZone)
  if (!parts) return ""
  return `${parts.year}.${parts.month}.${parts.day} ${parts.hour}:${parts.minute}`
}

export const formatShortDateTime = (
  input: string | number | Date,
  lang: string = "ko-KR",
  timeZone: string = "Asia/Seoul"
): string => {
  const parts = toParts(input, lang, timeZone)
  if (!parts) return ""
  return `${parts.month}.${parts.day} ${parts.hour}:${parts.minute}`
}
