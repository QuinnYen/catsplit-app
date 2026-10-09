const MAX_OUTPUT_WIDTH = 960

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image()
  img.onload = () => resolve(img)
  img.onerror = reject
  img.src = src
})

/**
 * 依 react-easy-crop 回傳的 pixelCrop 裁出 JPEG Blob，輸出寬度上限 960px
 */
export const getCroppedBlob = async (imageSrc, pixelCrop) => {
  const img = await loadImage(imageSrc)
  const scale = Math.min(1, MAX_OUTPUT_WIDTH / pixelCrop.width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(pixelCrop.width * scale)
  canvas.height = Math.round(pixelCrop.height * scale)
  canvas.getContext('2d').drawImage(
    img,
    pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
    0, 0, canvas.width, canvas.height,
  )
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('裁切失敗'))), 'image/jpeg', 0.8)
  })
}
