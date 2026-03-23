export const AUTH_EMAIL_MAX_LENGTH = 320
export const AUTH_PASSWORD_MIN_LENGTH = 8
export const AUTH_PASSWORD_MAX_LENGTH = 64

const AUTH_EMAIL_REGEX =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/

const PASSWORD_LOWERCASE_REGEX = /[a-z]/
const PASSWORD_UPPERCASE_REGEX = /[A-Z]/
const PASSWORD_DIGIT_REGEX = /\d/
const PASSWORD_SPECIAL_CHAR_REGEX = /[^A-Za-z0-9]/

export type PasswordPolicyState = {
  length: boolean
  lowercase: boolean
  uppercase: boolean
  digit: boolean
  special: boolean
  valid: boolean
}

export const normalizeAuthEmail = (value: string) => value.trim().toLowerCase()

export const isValidAuthEmail = (value: string) => {
  const normalized = normalizeAuthEmail(value)
  if (!normalized || normalized.length > AUTH_EMAIL_MAX_LENGTH) return false
  return AUTH_EMAIL_REGEX.test(normalized)
}

export const evaluatePasswordPolicy = (value: string): PasswordPolicyState => {
  const length =
    value.length >= AUTH_PASSWORD_MIN_LENGTH && value.length <= AUTH_PASSWORD_MAX_LENGTH
  const lowercase = PASSWORD_LOWERCASE_REGEX.test(value)
  const uppercase = PASSWORD_UPPERCASE_REGEX.test(value)
  const digit = PASSWORD_DIGIT_REGEX.test(value)
  const special = PASSWORD_SPECIAL_CHAR_REGEX.test(value)

  return {
    length,
    lowercase,
    uppercase,
    digit,
    special,
    valid: length && lowercase && uppercase && digit && special,
  }
}
