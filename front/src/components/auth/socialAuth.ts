import { CONFIG } from "site.config"
import { getApiBaseUrl } from "src/apis/backend/client"
import { normalizeNextPath } from "src/libs/router"
import { SocialAuthItem, SocialProvider } from "./SocialAuthButtons"

const PROVIDER_ORDER: SocialProvider[] = ["kakao", "google", "github"]

const isProviderEnabled = (provider: SocialProvider) => {
  const providerConfig = CONFIG.auth?.socialProviders?.[provider]
  return providerConfig?.enabled === true
}

export const getEnabledSocialProviders = () => {
  return PROVIDER_ORDER.filter((provider) => isProviderEnabled(provider))
}

export const toProviderOAuthUrl = (provider: SocialProvider, nextPath: string) => {
  if (typeof window === "undefined") return ""
  const normalizedNextPath = normalizeNextPath(nextPath)
  const redirectUrl = `${window.location.origin}${normalizedNextPath}`
  return `${getApiBaseUrl()}/oauth2/authorization/${provider}?redirectUrl=${encodeURIComponent(redirectUrl)}`
}

export const buildSocialAuthItems = (nextPath: string): SocialAuthItem[] => {
  return getEnabledSocialProviders().map((provider) => ({
    provider,
    onClick: () => {
      const oauthUrl = toProviderOAuthUrl(provider, nextPath)
      if (!oauthUrl || typeof window === "undefined") return
      window.location.href = oauthUrl
    },
  }))
}
