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
    // Read all image slices
    const image = await tiff.getImage(0)
    const nFrames = await tiff.getImageCount()
    const width = image.getWidth()
    const height = image.getHeight()
    let samplesPerPixel = image.getSamplesPerPixel()
    const bitDepth = image.getBytesPerPixel() * 8
    // Create NIfTI header
    const hdr = new nifti.NIFTI1()
    hdr.littleEndian = true
    hdr.pixDims = [1, 1, 1, 1, 1, 0, 0, 0]
    // for ImageJ and OME: header values stored in ImageDescription
    const metadata = image.getFileDirectory()
    // console.log(metadata)
    // TODO ResolutionUnit 296 SHORT Inch Centimter
    const imageDescription = metadata.ImageDescription
    let sizeZ = 1 //slices
    let sizeT = 1 //timepoints
    let sizeC = 1 //channels
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
          sliceOrder[i] = Z[i] + T[i] * sizeZ + C[i] * sizeZ * sizeT
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
    let isInterleave = true
    let isRGB = (samplesPerPixel === 3 && bitDepth === 24) || (samplesPerPixel === 4 && bitDepth === 32)
    if (sizeZ * sizeT === 1 && samplesPerPixel > 1 && !isRGB && nFrames % samplesPerPixel === 0) {
      hdr.dims[0] = 4
      hdr.dims[3] = Math.floor(nFrames / samplesPerPixel)
      hdr.dims[4] = samplesPerPixel
      samplesPerPixel = 1
      isInterleave = false
      throw new Error('TODO: Leica LSM e.g. colocsample1b.lsm')
    }
    if (isVerbose) {
      console.log(
        `NIfTI dimensions: ${hdr.dims.slice(1).join('×')}, bit-depth: ${bitDepth}, channels: ${samplesPerPixel}, pixDims: ${hdr.pixDims.slice(1, 4).join('×')} unit: ${hdr.xyzt_units}`
      )
    }
    // Determine datatype based on bit depth
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
    } else if (bitDepth === 24 && samplesPerPixel === 3) {
      hdr.numBitsPerVoxel = 24
      hdr.datatypeCode = 128 // DT_RGB
    } else if (bitDepth === 32 && samplesPerPixel === 4) {
      hdr.numBitsPerVoxel = 32
      hdr.datatypeCode = 2304 // DT_RGBA32
    } else {
      throw new Error(`Unsupported TIFF bit depth: ${bitDepth}, channels: ${samplesPerPixel}`)
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
    for (let i = 0; i < nFrames; i++) {
      //if (isVerbose) console.log(`Processing slice ${i}`)
      const image = await tiff.getImage(i)
      const img = await image.readRasters({ interleave: isInterleave })
      if (isInterleave) {
        const offset = sliceOrder[i] * width * height * samplesPerPixel
        if (img.length !== width * height * samplesPerPixel) {
          throw new Error(
            `All slices must have the same dimensions. Unexpected pixel count in slice ${i}: expected ${width * height * samplesPerPixel}, got ${img.length}`
          )
        }
        imgArray.set(img, offset)
      } else {
        /*TODO const rows = img.length // Number of arrays
              const cols = rows > 0 ? img[0].length : 0; // Length of the first array
              console.log(`i ${rows}x${cols}`)
              const metadata = image.getFileDirectory()*/
      }
    }
    const img8 = new Uint8Array(imgArray.buffer)
    // Finalize NIfTI file
    hdr.vox_offset = 352
    hdr.scl_inter = 0
    hdr.scl_slope = 1
    hdr.magic = 'n+1'
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
