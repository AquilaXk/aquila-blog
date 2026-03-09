export const formatDate = (
  input: string | number | Date,
  lang: string = "en-US"
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
    }

    return date.toLocaleDateString(lang, options)
  } catch {
    return ""
  }
}
