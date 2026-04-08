import type { CaptureRect } from '@/shared/types'

export async function cropVisibleArea(imageDataUrl: string, rect: CaptureRect) {
  const blob = await fetch(imageDataUrl).then((response) => response.blob())
  const image = await createImageBitmap(blob)
  const scale = rect.devicePixelRatio ?? 1
  const canvas = new OffscreenCanvas(rect.width * scale, rect.height * scale)
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('캡처 이미지를 자를 수 없습니다.')
  }

  context.drawImage(
    image,
    rect.x * scale,
    rect.y * scale,
    rect.width * scale,
    rect.height * scale,
    0,
    0,
    rect.width * scale,
    rect.height * scale,
  )

  const output = await canvas.convertToBlob({ type: 'image/png' })

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('캡처 이미지 변환에 실패했습니다.'))
    reader.readAsDataURL(output)
  })
}
