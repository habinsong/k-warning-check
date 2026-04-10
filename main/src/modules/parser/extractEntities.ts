import type { TextEntities } from '@/shared/types'

const URL_PATTERN =
  /((https?:\/\/)?([\w-]+\.)+[a-z]{2,}(\/[\w\-./?%&=+#:]*)?)/giu
const PHONE_PATTERN = /(01[0-9]|0[2-6][0-9]?)-?\d{3,4}-?\d{4}/gu
const ACCOUNT_PATTERN = /\b\d{2,4}-\d{2,6}-\d{2,6}\b/gu
const OPEN_CHAT_PATTERN =
  /(open\.kakao\.com\/o\/[\w-]+|chat\.whatsapp\.com\/[\w-]+|wa\.me\/\d+|discord\.gg\/[\w-]+|m\.me\/[\w.-]+)/giu
const TELEGRAM_PATTERN = /(t\.me\/[\w-]+|telegram)/giu
const SHORT_URL_HOSTS = [
  'bit.ly',
  'tinyurl.com',
  'han.gl',
  'c11.kr',
  't.co',
  'cutt.ly',
  'shorturl.at',
  'rebrand.ly',
]

export function extractEntities(text: string): TextEntities {
  const urls = text.match(URL_PATTERN) ?? []

  return {
    urls,
    shortUrls: urls.filter((url) =>
      SHORT_URL_HOSTS.some((host) => url.toLowerCase().includes(host)),
    ),
    phoneNumbers: text.match(PHONE_PATTERN) ?? [],
    accounts: text.match(ACCOUNT_PATTERN) ?? [],
    openChatLinks: text.match(OPEN_CHAT_PATTERN) ?? [],
    telegramLinks: text.match(TELEGRAM_PATTERN) ?? [],
  }
}
