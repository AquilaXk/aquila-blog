const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0

const toSafeInt = (value, fallback) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value)
  }
  return fallback
}

module.exports = {
  isNonEmptyString,
  toSafeInt,
}
