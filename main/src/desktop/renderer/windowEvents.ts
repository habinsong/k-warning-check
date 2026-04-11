export type DesktopWindowTab = 'analyze' | 'settings' | 'history'
export type DesktopWindowInputTab = 'text' | 'url' | 'image' | 'clipboard'

export interface DesktopNavigationEventPayload {
  tab?: DesktopWindowTab
  inputTab?: DesktopWindowInputTab
  text?: string
  url?: string
}

export const MAIN_NAVIGATION_EVENT = 'kwc:navigate-main'
