import { fromArrayBuffer } from 'geotiff'
import * as nifti from 'nifti-reader-js'
import { DOMParser } from 'xmldom'

function parseLSMInfo(uint8Array) {
  // Use DataView to read the binary structure
  const dataView = new DataView(uint8Array.buffer)
  let offset = 0

  function readUint32() {
    const value = dataView.getUint32(offset, true) // Little-endian
    offset += 4
    return value
  }

  function readUint16() {
    const value = dataView.getUint16(offset, true) // Little-endian
    offset += 2
    return value
  }

  function readFloat64() {
    const value = dataView.getFloat64(offset, true) // Little-endian
    offset += 8
    return value
  }

  const lsmInfo = {
    MagicNumber: readUint32(),
    StructureSize: readUint32(),
    DimensionX: readUint32(),
    DimensionY: readUint32(),
    DimensionZ: readUint32(),
    DimensionChannels: readUint32(),
    DimensionTime: readUint32(),
    IntensityDataType: readUint32(),
    ThumbnailX: readUint32(),
    ThumbnailY: readUint32(),
    VoxelSizeX: readFloat64(),
    VoxelSizeY: readFloat64(),
    VoxelSizeZ: readFloat64(),
    OriginX: readFloat64(),
    OriginY: readFloat64(),
    OriginZ: readFloat64(),
    ScanType: readUint16(),
    SpectralScan: readUint16(),
    DataType: readUint32(),
    OffsetVectorOverlay: readUint32(),
    OffsetInputLut: readUint32(),
    OffsetOutputLut: readUint32(),
    OffsetChannelColors: readUint32(),
    TimeInterval: readFloat64(),
    OffsetChannelDataTypes: readUint32(),
    OffsetScanInformation: readUint32(),
    OffsetKsData: readUint32(),
    OffsetTimeStamps: readUint32(),
    OffsetEventList: readUint32(),
    OffsetRoi: readUint32(),
    OffsetBleachRoi: readUint32(),
    OffsetNextRecording: readUint32(),
    DisplayAspectX: readFloat64(),
    DisplayAspectY: readFloat64(),
    DisplayAspectZ: readFloat64(),
    DisplayAspectTime: readFloat64(),
    OffsetMeanOfRoisOverlay: readUint32(),
    OffsetTopoIsolineOverlay: readUint32(),
    OffsetTopoProfileOverlay: readUint32(),
    OffsetLinescanOverlay: readUint32(),
    ToolbarFlags: readUint32(),
    OffsetChannelWavelength: readUint32(),
    OffsetChannelFactors: readUint32(),
    ObjectiveSphereCorrection: readFloat64(),
    OffsetUnmixParameters: readUint32()
  }
  return lsmInfo
}

export async function tiff2niiStack(inBuffer, isVerbose = false, stackGroup = 0) {
  try {
    let arrayBuffer = inBuffer
    // Buffer is an instance of Uint8Array, so we can use that (in most places)
    // see: https://sindresorhus.com/blog/goodbye-nodejs-buffer
    if (inBuffer instanceof Uint8Array) {
      arrayBuffer = inBuffer.buffer.slice(inBuffer.byteOffset, inBuffer.byteOffset + inBuffer.byteLength)
    }
    if (!(arrayBuffer instanceof ArrayBuffer)) {
      throw new Error('Unsupported input type: Expected Buffer or ArrayBuffer')
    }
    const tiff = await fromArrayBuffer(arrayBuffer)
    let nFrames = await tiff.getImageCount()
    // detect all stack group (2D slices with different dimensions)
    let images = []
    const stackGroups = new Array(nFrames).fill(0) // Default group is 0
    let stackConfigs = [] // Store unique slice configurations as an array
    for (let i = 0; i < nFrames; i++) {
      const img = await tiff.getImage(i)
      images.push(img)
      const width = img.getWidth()
      const height = img.getHeight()
      const samplesPerPixel = img.getSamplesPerPixel()
      const bitDepth = img.getBytesPerPixel() * 8
      // Create a unique key for this configuration
      const configKey = `${width}x${height}c${samplesPerPixel}b${bitDepth}`
      let configIndex = stackConfigs.indexOf(configKey)
      if (configIndex === -1) {
        stackConfigs.push(configKey)
        configIndex = stackConfigs.length - 1 // New index
      }
      // Assign the group index to this slice
      stackGroups[i] = configIndex
    }
    // n.b. read meta data from first TIFF directory, prior to culling stack groups
    const metadata = images[0].getFileDirectory()
    // cull 2D slices from other stack groups
    if (stackConfigs.length > 1) {
      if (stackGroup >= stackConfigs.length || stackGroup < 0) stackGroup = 0
      images = images.filter((_, i) => stackGroups[i] === stackGroup)
      if (isVerbose) {
        console.log(`${images.length} of ${nFrames} slices match dimensions of stackGroup ${stackGroup}`)
      }
      nFrames = images.length
    }
    // now all 2D slices in images[] are from the same stack with identical dimensions
    const width = images[0].getWidth()
    const height = images[0].getHeight()
    let samplesPerPixel = images[0].getSamplesPerPixel()
    const bitDepth = images[0].getBytesPerPixel() * 8
    //we will convert all 2D slices that match the shape of the first
    let sizeZ = 1 //slices
    let sizeT = 1 //timepoints
    let sizeC = 1 //channels
    // Create NIfTI header
    const hdr = new nifti.NIFTI1()
    hdr.littleEndian = true
    hdr.vox_offset = 352
    hdr.scl_inter = 0
    hdr.scl_slope = 1
    hdr.magic = 'n+1'
    hdr.pixDims = [1, 1, 1, 1, 1, 0, 0, 0]
    // for ImageJ and OME: header values stored in ImageDescription
    // Read LSM header
    // since geotiff does not have a name for tag 34412, it explicitly calls it "undefined"
    //  we can still identify it from the first four bytes "MagicNumber"
    let isLSM = false
    if (
      metadata?.undefined instanceof Uint8Array && // Ensure it's a Uint8Array
      metadata.undefined.length >= 224 &&
      metadata.undefined[0] === 76 && // 'L'
      metadata.undefined[1] === 73 && // 'I'
      metadata.undefined[2] === 0 &&
      metadata.undefined[3] === 4
    ) {
      const hdrLSM = parseLSMInfo(metadata.undefined)
      // scale for thumbnail images
      let scaleX = hdrLSM.DimensionX / width
      hdr.pixDims[1] = scaleX * hdrLSM.VoxelSizeX * 1000000.0
      let scaleY = hdrLSM.DimensionY / height
      hdr.pixDims[2] = scaleY * hdrLSM.VoxelSizeY * 1000000.0
      // n.b. thumbnails scaled inplane (X/Y) not Z
      hdr.pixDims[3] = hdrLSM.VoxelSizeZ * 1000000.0
      hdr.pixDims[4] = hdrLSM.TimeInterval
      // units: NIFTI_UNITS_MICRON + NIFTI_UNITS_SEC
      // todo: check Zeiss really specifies as sec
      hdr.xyzt_units = 3 + 8
      sizeZ = hdrLSM.DimensionZ
      sizeT = hdrLSM.DimensionTime
      sizeC = hdrLSM.DimensionChannels
      isLSM = true
      if (nFrames !== sizeZ * sizeT * sizeC) {
        if (nFrames === sizeZ * sizeT) {
          //each channel has unique resolution, hence its own slice group
          sizeC = 1
        } else {
          console.log(hdrLSM)
          console.log(`Inconsistent LSM TIFF ${sizeZ}×${sizeT}×${sizeC} != ${nFrames} (perhaps multi-dimensional)`)
          console.log(`${width}×${height}c${samplesPerPixel}bpp${bitDepth}`)
        }
      }
    }
    const imageDescription = metadata.ImageDescription
    let sliceOrder = new Array(nFrames)
    for (let i = 0; i < nFrames; i++) sliceOrder[i] = i
    //ImageJ meta data
    if (imageDescription?.includes('ImageJ=')) {
      const zMatch = imageDescription.match(/slices=(\d+)/)
      const tMatch = imageDescription.match(/frames=(\d+)/)
      const cMatch = imageDescription.match(/channels=(\d+)/)
      const spacingMatch = imageDescription.match(/spacing=([\d.]+)/)
      const unitMatch = imageDescription.match(/unit=([\S]+)/)
      sizeZ = zMatch ? parseInt(zMatch[1], 10) : 1
      sizeT = tMatch ? parseInt(tMatch[1], 10) : 1
      sizeC = cMatch ? parseInt(cMatch[1], 10) : 1
      const spacing = spacingMatch ? parseFloat(spacingMatch[1]) : 1.0
      //ResolutionUnit is 1=undefined, 2=inch(default), 3=cm, but ImageJ interprets 1 as cm
      let scale = metadata.ResolutionUnit === 2 ? 2.54 : 1
      const xRes = metadata.XResolution ? metadata.XResolution[0] / metadata.XResolution[1] : 1
      hdr.pixDims[1] = scale / xRes
      const yRes = metadata.YResolution ? metadata.YResolution[0] / metadata.YResolution[1] : 1
      hdr.pixDims[2] = scale / yRes // Convert DPI to µm
      // ImageJ "spacing" is z-spacing, see flybrain.tif
      hdr.pixDims[3] = spacing
      const unit = unitMatch ? unitMatch[1] : ''
      const isUm = ['µm', '\xB5m', '�m'].includes(unit)
      if (isUm) hdr.xyzt_units = 3
      if (nFrames > 1 && sizeZ * sizeT * sizeC === nFrames) {
        //reorder so 5D data is X,Y, Space (z), Time (t), Channel (c)
        const zIndex = imageDescription.indexOf('slices=')
        const tIndex = imageDescription.indexOf('frames=')
        const cIndex = imageDescription.indexOf('channels=')
        let zStep = 1
        if (zIndex > tIndex) zStep *= sizeT
        if (zIndex > cIndex) zStep *= sizeC
        let tStep = 1
        if (tIndex > zIndex) tStep *= sizeZ
        if (tIndex > cIndex) tStep *= sizeC
        let cStep = 1
        if (cIndex > zIndex) cStep *= sizeZ
        if (cIndex > tIndex) cStep *= sizeT
        for (let i = 0; i < nFrames; i++) {
          let z = Math.floor(i / zStep) % sizeZ
          let t = Math.floor(i / tStep) % sizeT
          let c = Math.floor(i / cStep) % sizeC
          let order = z + t * sizeZ + c * (sizeZ * sizeT)
          sliceOrder[i] = order
        }
      }
    } //if ImageJ
    //parse OME-tiff
    if (imageDescription?.includes('<OME xml')) {
      const parser = new DOMParser()
      const xmlDoc = parser.parseFromString(imageDescription, 'text/xml')
      // Extract number of Z slices, time frames, and channels from <Pixels>
      const pixelsNode = xmlDoc.getElementsByTagName('Pixels')[0]
      sizeZ = parseInt(pixelsNode.getAttribute('SizeZ'), 10) || 1
      sizeT = parseInt(pixelsNode.getAttribute('SizeT'), 10) || 1
      sizeC = parseInt(pixelsNode.getAttribute('SizeC'), 10) || 1
      hdr.pixDims[1] = parseFloat(pixelsNode.getAttribute('PhysicalSizeX')) || 1
      hdr.pixDims[2] = parseFloat(pixelsNode.getAttribute('PhysicalSizeY')) || 1
      hdr.pixDims[3] = parseFloat(pixelsNode.getAttribute('PhysicalSizeZ')) || 1
      if ((pixelsNode.getAttribute('PhysicalSizeXUnit') || '') === 'µm') hdr.xyzt_units = 3
      if ((pixelsNode.getAttribute('PhysicalSizeXUnit') || '') === 'mm') hdr.xyzt_units = 2
      if ((pixelsNode.getAttribute('PhysicalSizeXUnit') || '') === 'µm') hdr.xyzt_units = 3
      if ((pixelsNode.getAttribute('PhysicalSizeXUnit') || '') === 'mm') hdr.xyzt_units = 2
      const planes = xmlDoc.getElementsByTagName('Plane')
      if (planes.length > 0) {
        let Z = new Array(nFrames).fill(0)
        let T = new Array(nFrames).fill(0)
        let C = new Array(nFrames).fill(0)
        for (let i = 0; i < Math.min(planes.length, nFrames); i++) {
          const plane = planes[i]
          Z[i] = parseInt(plane.getAttribute('TheZ'), 10) || 0
          T[i] = parseInt(plane.getAttribute('TheT'), 10) || 0
          C[i] = parseInt(plane.getAttribute('TheC'), 10) || 0
        }
        // Map TIFF slice indices into output volume order
        for (let i = 0; i < nFrames; i++) {
          let order = Z[i] + T[i] * sizeZ + C[i] * sizeZ * sizeT
          sliceOrder[i] = order
        }
        if (isVerbose) {
          console.log(`OME SizeZ: ${sizeZ}, SizeT: ${sizeT}, SizeC: ${sizeC}`)
        }
      } // if multiple planes
    } //if isOME
    //set dims
    hdr.dims = [3, width, height, nFrames, 0, 0, 0, 0]
    if (sizeZ * sizeT * sizeC === nFrames && sizeT * sizeC > 1 && nFrames > 1) {
      hdr.dims[0] = 4
      hdr.dims[3] = sizeZ
      hdr.dims[4] = sizeT
      if (sizeC > 1) {
        hdr.dims[0] = 5
        hdr.dims[5] = sizeC
      } // if 5D
    } // if >3D
    // Determine datatype based on bit depth
    let isRG = false
    if (bitDepth === 16 && samplesPerPixel === 1) {
      hdr.numBitsPerVoxel = 16
      let sampleFormat = metadata.SampleFormat ? metadata.SampleFormat[0] : undefined
      if (sampleFormat === 2) {
        hdr.datatypeCode = 4 // DT_INT16
      } else {
        hdr.datatypeCode = 512 // DT_UINT16
      }
    } else if (bitDepth === 8 && samplesPerPixel === 1) {
      hdr.numBitsPerVoxel = 8
      hdr.datatypeCode = 2 // DT_UINT8
    } else if (bitDepth === 16 && samplesPerPixel === 2) {
      //this is special: we need to pad RG images to RGB
      isRG = true
      samplesPerPixel = 3
      hdr.numBitsPerVoxel = 24
      hdr.datatypeCode = 128 // DT_RGB
    } else if (bitDepth === 24 && samplesPerPixel === 3) {
      hdr.numBitsPerVoxel = 24
      hdr.datatypeCode = 128 // DT_RGB
    } else if (bitDepth === 32 && samplesPerPixel === 1) {
      hdr.numBitsPerVoxel = 32
      let sampleFormat = metadata.SampleFormat ? metadata.SampleFormat[0] : undefined
      // 1=uint, 2=int, 3=float
      if (sampleFormat === 2) {
        hdr.datatypeCode = 8 // DT_INT32
      } else if (sampleFormat === 3) {
        hdr.datatypeCode = 16 // DT_FLOAT32
      } else {
        hdr.datatypeCode = 768 // DT_UINT32
      }
    } else if (bitDepth === 32 && samplesPerPixel === 4) {
      hdr.numBitsPerVoxel = 32
      hdr.datatypeCode = 2304 // DT_RGBA32
    } else {
      throw new Error(`Unsupported TIFF bit depth: ${bitDepth}, channels: ${samplesPerPixel}`)
    }
    if (isVerbose) {
      console.log(
        `NIfTI dimensions: ${hdr.dims.slice(1).join('×')}, bit-depth: ${bitDepth}, channels: ${samplesPerPixel}, pixDims: ${hdr.pixDims.slice(1, 4).join('×')} unit: ${hdr.xyzt_units}`
      )
    }
    // Create image data buffer
    const nvox = width * height * nFrames
    let imgArray
    if (hdr.datatypeCode === 4) {
      imgArray = new Int16Array(nvox)
    } else if (hdr.datatypeCode === 8) {
      imgArray = new Int32Array(nvox)
    } else if (hdr.datatypeCode === 16) {
      imgArray = new Float32Array(nvox)
    } else if (hdr.datatypeCode === 512) {
      imgArray = new Uint16Array(nvox)
    } else if (hdr.datatypeCode === 768) {
      imgArray = new Uint32Array(nvox)
    } else {
      imgArray = new Uint8Array(nvox * samplesPerPixel)
    }
    // Read pixel data from each slice
    for (let i = 0; i < nFrames; i++) {
      if (sliceOrder[i] < 0 || sliceOrder[i] >= nFrames) {
        throw new Error(`Fatal error`)
      }
      const image = images[i]
      //n.b. pools can improve performance https://geotiffjs.github.io/geotiff.js/
      let img = await image.readRasters({ interleave: true })
      if (isRG) {
        //convert RG to RGB
        let imgRG = new Uint8Array(img)
        let nPx = width * height
        img = new Uint8Array(nPx * 3)
        let j = 0
        for (let i = 0; i < imgRG.length; i += 2) {
          img[j++] = imgRG[i]
          img[j++] = imgRG[i + 1]
          img[j++] = 0
        }
      } //if RG
      const offset = sliceOrder[i] * width * height * samplesPerPixel
      imgArray.set(img, offset)
    }
    const img8 = new Uint8Array(imgArray.buffer)
    // Create the 4×4 affine transformation matrix
    const dxs = [hdr.pixDims[1], hdr.pixDims[2], hdr.pixDims[3]]
    const ns = [hdr.dims[1], hdr.dims[2], hdr.dims[3]]
    hdr.affine = [
      [dxs[0], 0, 0, -((dxs[0] * ns[0]) / 2)],
      [0, dxs[1], 0, -((dxs[1] * ns[1]) / 2)],
      [0, 0, dxs[2], -((dxs[2] * ns[2]) / 2)],
      [0, 0, 0, 1]
    ]
    // Copy header and image data to NIfTI file
    const hdrBuffer = hdr.toArrayBuffer()
    // Merge header and voxel data
    const niftiData = new Uint8Array(hdrBuffer.byteLength + img8.byteLength)
    niftiData.set(new Uint8Array(hdrBuffer), 0)
    niftiData.set(img8, hdrBuffer.byteLength)
    return {
      niftiImage: niftiData, // The NIfTI image as a Uint8Array
      stackConfigs: stackConfigs // The list of unique stack configurations
    }
  } catch (error) {
    console.error('Error reading TIFF file:', error.message)
  }
}

export async function tiff2nii(inBuffer, isVerbose = false) {
  //this function only reads the first stack from a TIFF hyper stack
  const { niftiImage, stackConfigs } = await tiff2niiStack(inBuffer, isVerbose, 0)
  return niftiImage
}
