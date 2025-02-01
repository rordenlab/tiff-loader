import { fromArrayBuffer } from 'geotiff'
import * as nifti from 'nifti-reader-js'
import { DOMParser } from 'xmldom'
// n.b. : largely duplicates of /nvimage/utils.ts but avoids dependency
function str2BufferX(str, maxLen) {
  // emulate node.js Buffer.from
  // remove characters than could be used for shell expansion
  str = str.replace(/[`$]/g, '')
  const bytes = []
  const len = Math.min(maxLen, str.length)
  for (let i = 0; i < len; i++) {
    const char = str.charCodeAt(i)
    bytes.push(char & 0xff)
  }
  return bytes
}
// save NIfTI header into UINT8 array for saving to disk
function hdrToArrayBufferX(hdr) {
  const SHORT_SIZE = 2
  const FLOAT32_SIZE = 4
  const isLittleEndian = true
  const byteArray = new Uint8Array(348)
  const view = new DataView(byteArray.buffer)
  view.setInt32(0, 348, isLittleEndian)
  // data_type, db_name, extents, session_error, regular are not used
  // regular set to 'r' (ASCII 114) for Analyze compatibility
  view.setUint8(38, 114)
  // dim_info
  view.setUint8(39, hdr.dim_info)
  // dims
  for (let i = 0; i < 8; i++) {
    view.setUint16(40 + SHORT_SIZE * i, hdr.dims[i], isLittleEndian)
  }
  // intent_p1, intent_p2, intent_p3
  view.setFloat32(56, hdr.intent_p1, isLittleEndian)
  view.setFloat32(60, hdr.intent_p2, isLittleEndian)
  view.setFloat32(64, hdr.intent_p3, isLittleEndian)
  // intent_code, datatype, bitpix, slice_start
  view.setInt16(68, hdr.intent_code, isLittleEndian)
  view.setInt16(70, hdr.datatypeCode, isLittleEndian)
  view.setInt16(72, hdr.numBitsPerVoxel, isLittleEndian)
  view.setInt16(74, hdr.slice_start, isLittleEndian)
  // pixdim[8], vox_offset, scl_slope, scl_inter
  for (let i = 0; i < 8; i++) {
    view.setFloat32(76 + FLOAT32_SIZE * i, hdr.pixDims[i], isLittleEndian)
  }
  view.setFloat32(108, 352, isLittleEndian)
  view.setFloat32(112, hdr.scl_slope, isLittleEndian)
  view.setFloat32(116, hdr.scl_inter, isLittleEndian)
  view.setInt16(120, hdr.slice_end, isLittleEndian)
  // slice_code, xyzt_units
  view.setUint8(122, hdr.slice_code)
  if (hdr.xyzt_units === 0) {
    view.setUint8(123, 10)
  } else {
    view.setUint8(123, hdr.xyzt_units)
  }
  // cal_max, cal_min, slice_duration, toffset
  view.setFloat32(124, hdr.cal_max, isLittleEndian)
  view.setFloat32(128, hdr.cal_min, isLittleEndian)
  view.setFloat32(132, hdr.slice_duration, isLittleEndian)
  view.setFloat32(136, hdr.toffset, isLittleEndian)
  // glmax, glmin are unused
  // descrip and aux_file
  byteArray.set(str2BufferX(hdr.description), 148)
  byteArray.set(str2BufferX(hdr.aux_file), 228)
  // qform_code, sform_code
  view.setInt16(252, hdr.qform_code, isLittleEndian)
  // if sform unknown, assume NIFTI_XFORM_SCANNER_ANAT
  if (hdr.sform_code < 1 || hdr.sform_code < 1) {
    view.setInt16(254, 1, isLittleEndian)
  } else {
    view.setInt16(254, hdr.sform_code, isLittleEndian)
  }
  // quatern_b, quatern_c, quatern_d, qoffset_x, qoffset_y, qoffset_z, srow_x[4], srow_y[4], and srow_z[4]
  view.setFloat32(256, hdr.quatern_b, isLittleEndian)
  view.setFloat32(260, hdr.quatern_c, isLittleEndian)
  view.setFloat32(264, hdr.quatern_d, isLittleEndian)
  view.setFloat32(268, hdr.qoffset_x, isLittleEndian)
  view.setFloat32(272, hdr.qoffset_y, isLittleEndian)
  view.setFloat32(276, hdr.qoffset_z, isLittleEndian)
  const flattened = hdr.affine.flat()
  // we only want the first three rows
  for (let i = 0; i < 12; i++) {
    view.setFloat32(280 + FLOAT32_SIZE * i, flattened[i], isLittleEndian)
  }
  // magic
  view.setInt32(344, 3222382, true) // "n+1\0"
  return byteArray
}

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

export async function tiff2nii(inBuffer, isVerbose = false) {
  try {
    // Load the TIFF using geotiff.js
    let arrayBuffer = inBuffer
    // Buffer is an instance of Uint8Array, so we can use that (in most places)
    // see: https://sindresorhus.com/blog/goodbye-nodejs-buffer
    //
    // if (Buffer.isBuffer(inBuffer)) {
    //   arrayBuffer = inBuffer.buffer.slice(inBuffer.byteOffset, inBuffer.byteOffset + inBuffer.byteLength)
    // }
    if (inBuffer instanceof Uint8Array) {
      arrayBuffer = inBuffer.buffer.slice(inBuffer.byteOffset, inBuffer.byteOffset + inBuffer.byteLength)
    }
    if (!(arrayBuffer instanceof ArrayBuffer)) {
      throw new Error('Unsupported input type: Expected Buffer or ArrayBuffer')
    }
    const tiff = await fromArrayBuffer(arrayBuffer)
    // Read all 2D slices
    let nFrames = await tiff.getImageCount()
    const images = []
    for (let i = 0; i < nFrames; i++) {
      images.push(await tiff.getImage(i))
    }
    //we will convert all 2D slices that match the shape of the first
    const image0 = images[0]
    const width = image0.getWidth()
    const height = image0.getHeight()
    let samplesPerPixel = image0.getSamplesPerPixel()
    const bitDepth = image0.getBytesPerPixel() * 8
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
    const metadata = image0.getFileDirectory()
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
      hdr.pixDims[1] = hdrLSM.VoxelSizeX * 1000000.0
      hdr.pixDims[2] = hdrLSM.VoxelSizeX * 1000000.0
      hdr.pixDims[3] = hdrLSM.VoxelSizeX * 1000000.0
      hdr.xyzt_units = 3
      sizeZ = hdrLSM.DimensionZ
      sizeT = hdrLSM.DimensionTime
      sizeC = hdrLSM.DimensionChannels
      isLSM = true
      if (nFrames !== sizeZ * sizeT * sizeC) {
        console.log(hdrLSM)
        console.log(`Inconsistent LSM TIFF ${sizeZ}×${sizeT}×${sizeC} != ${nFrames} (perhaps multi-dimensional)`)
        console.log(`${width}×${height}c${samplesPerPixel}bpp${bitDepth}`)
      }
    }
    const imageDescription = metadata.ImageDescription
    //ImageJ meta data
    if (imageDescription?.includes('ImageJ=')) {
      const slicesMatch = imageDescription.match(/slices=(\d+)/)
      const framesMatch = imageDescription.match(/frames=(\d+)/)
      const spacingMatch = imageDescription.match(/spacing=([\d.]+)/)
      const unitMatch = imageDescription.match(/unit=([\S]+)/)
      sizeZ = slicesMatch ? parseInt(slicesMatch[1], 10) : 1
      sizeT = framesMatch ? parseInt(framesMatch[1], 10) : 1
      const spacing = spacingMatch ? parseFloat(spacingMatch[1]) : 1.0
      hdr.pixDims[1] = spacing
      hdr.pixDims[2] = spacing
      hdr.pixDims[3] = spacing
      const unit = unitMatch ? unitMatch[1] : ''
      const isUm = ['µm', '\xB5m', '�m'].includes(unit)
      if (isUm) hdr.xyzt_units = 3
    }
    //parse OME-tiff
    let isSliceOrderSequential = true
    let sliceOrder = new Array(nFrames)
    for (let i = 0; i < nFrames; i++) sliceOrder[i] = i
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
          if (order !== i) {
            isSliceOrderSequential = false
          }
          sliceOrder[i] = order
        }
        if (isVerbose) {
          console.log(`OME SizeZ: ${sizeZ}, SizeT: ${sizeT}, SizeC: ${sizeC}`)
        }
      } // if multiple planes
    } //if isOME
    //determine if any slices differ from the first
    let nFramesTotal = nFrames
    nFrames = 0
    for (let i = 0; i < nFramesTotal; i++) {
      const image = images[i]
      const widthI = image.getWidth()
      const heightI = image.getHeight()
      let samplesPerPixelI = image.getSamplesPerPixel()
      const bitDepthI = image.getBytesPerPixel() * 8
      if (widthI === width && heightI === height && samplesPerPixelI === samplesPerPixel && bitDepthI === bitDepth) {
        sliceOrder[i] = nFrames
        nFrames++
        continue
      }
      sliceOrder[i] = -1
      if (i !== nFrames) {
        continue //only report 1st mismatch
      }
      console.log(
        `${i} Unable to stack all TIFF slices (dimensions vary): ${width}×${height}c${samplesPerPixel}bpp${bitDepth} vs ${widthI}×${heightI}c${samplesPerPixelI}bpp${bitDepthI}`
      )
    }
    if (nFrames !== nFramesTotal) {
      if (!isSliceOrderSequential) {
        throw new Error(`Slice order is not sequential and slice dimensions vary`)
      }
      if (isLSM && sizeZ * sizeT * sizeC !== nFrames) {
        if (sizeZ * sizeT === nFrames) {
          sizeC = 1
          console.log(`only copying first channel of LSM data`)
        }
      }
      console.log(`converting ${nFrames} of ${nFramesTotal} slices`)
    }
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
    } else if (hdr.datatypeCode === 512) {
      imgArray = new Uint16Array(nvox)
    } else {
      imgArray = new Uint8Array(nvox * samplesPerPixel)
    }
    // Read pixel data from each slice
    for (let i = 0; i < nFramesTotal; i++) {
      if (sliceOrder[i] < 0) {
        continue //this slice differs in dimension from the first slice
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
    const hdrBytes = hdrToArrayBufferX({ ...hdr, vox_offset: 352 })
    const opad = new Uint8Array(4)
    const odata = new Uint8Array(hdrBytes.length + opad.length + img8.length)
    odata.set(hdrBytes)
    odata.set(opad, hdrBytes.length)
    odata.set(img8, hdrBytes.length + opad.length)
    return odata
  } catch (error) {
    console.error('Error reading TIFF file:', error.message)
  }
}
