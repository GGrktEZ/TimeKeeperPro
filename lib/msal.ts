import { PublicClientApplication, type Configuration, type AccountInfo, type SilentRequest } from "@azure/msal-browser"

// Dynamics 365 CRM scope - this grants access to the Dynamics Web API
const DYNAMICS_ORG_URL = "https://theia.crm4.dynamics.com"
const DYNAMICS_SCOPE = `${DYNAMICS_ORG_URL}/.default`

const STORAGE_KEY = "dynamics_msal_config"

export interface MsalConfig {
  clientId: string
  tenantId: string
}

export function getSavedMsalConfig(): MsalConfig | null {
  if (typeof window === "undefined") return null
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return null
    const parsed = JSON.parse(stored)
    if (parsed.clientId && parsed.tenantId) return parsed
    return null
  } catch {
    return null
  }
}

export function saveMsalConfig(config: MsalConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

export function clearMsalConfig() {
  localStorage.removeItem(STORAGE_KEY)
}

let msalInstance: PublicClientApplication | null = null
let currentConfigKey = ""

export async function getMsalInstance(config: MsalConfig): Promise<PublicClientApplication> {
  const configKey = `${config.clientId}:${config.tenantId}`

  if (msalInstance && currentConfigKey === configKey) {
    return msalInstance
  }

  const msalConfig: Configuration = {
    auth: {
      clientId: config.clientId,
      authority: `https://login.microsoftonline.com/${config.tenantId}`,
      redirectUri: window.location.origin,
      postLogoutRedirectUri: window.location.origin,
    },
    cache: {
      cacheLocation: "localStorage",
      storeAuthStateInCookie: false,
    },
  }

  msalInstance = new PublicClientApplication(msalConfig)
  await msalInstance.initialize()
  currentConfigKey = configKey
  return msalInstance
}

export async function acquireDynamicsToken(config: MsalConfig): Promise<string> {
  const instance = await getMsalInstance(config)

  // Check for existing accounts
  const accounts = instance.getAllAccounts()
  const account: AccountInfo | undefined = accounts[0]

  if (account) {
    // Try silent token acquisition first
    const silentRequest: SilentRequest = {
      scopes: [DYNAMICS_SCOPE],
      account,
    }
    try {
      const result = await instance.acquireTokenSilent(silentRequest)
      return result.accessToken
    } catch {
      // Silent failed, fall through to popup
    }
  }

  // Interactive login via popup
  const result = await instance.acquireTokenPopup({
    scopes: [DYNAMICS_SCOPE],
  })
  return result.accessToken
}

export async function logoutMsal(config: MsalConfig): Promise<void> {
  const instance = await getMsalInstance(config)
  const accounts = instance.getAllAccounts()
  if (accounts.length > 0) {
    await instance.logoutPopup({ account: accounts[0] })
  }
}

export async function getActiveAccount(config: MsalConfig): Promise<AccountInfo | null> {
  const instance = await getMsalInstance(config)
  const accounts = instance.getAllAccounts()
  return accounts[0] ?? null
}
