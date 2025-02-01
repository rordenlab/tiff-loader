import { Niivue } from '@niivue/niivue'
import { tiff2nii } from './lib/loader'

export async function setupNiivue(element) {
  const nv = new Niivue()
  nv.attachToCanvas(element)
  // supply loader function, fromExt, and toExt (without dots)
  nv.useLoader(tiff2nii, 'tif', 'nii')
  await nv.loadImages([
    {
      url: '/shapes_deflate.tif'
    }
  ])
}
