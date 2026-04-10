export function getActiveTab() {
  return chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
    const [tab] = tabs

    if (!tab?.id) {
      throw new Error('활성 탭을 찾을 수 없습니다.')
    }

    return tab
  })
}
