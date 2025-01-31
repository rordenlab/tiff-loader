import { Image } from 'image-js'
import * as nifti from 'nifti-reader-js'

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

export async function tiff2nii(arrayBuffer, verbose = false) {
    try {
        // Load the image using image-js
        const imagesX = await Image.load(arrayBuffer)
        let images
        if (Array.isArray(imagesX)) {
            images = imagesX // Use directly if it's an array
        } else {
            images = [imagesX] // Wrap in an array if it's a single image
        }
        const n3x4 = images.length
        const image = images[0]
        let maxValue = image.maxValue
        for (let i = 0; i < n3x4 ; i++) {
          if (image.width !== images[i].width)
            throw new Error("Width varies across slices in the 3D TIFF.")
          if (image.height !== images[i].height)
            throw new Error("Height varies across slices in the 3D TIFF.")
          if (image.bitDepth !== images[i].bitDepth)
            throw new Error("BitDepth varies across slices in the 3D TIFF.")
          if (image.bitDepth !== images[i].bitDepth)
            throw new Error("BitDepth varies across slices in the 3D TIFF.")
          if (image.components !== images[i].components)
            throw new Error("Components varies across slices in the 3D TIFF.")
          maxValue = Math.max(maxValue, images[i].maxValue)
        } //for each slice
        function extractSlicesAndFrames(imageDescription) {
          //read ImageJ specific image description
          if (!imageDescription) return { slices: 1, frames: 1 }
          const slicesMatch = imageDescription.match(/slices=(\d+)/)
          const framesMatch = imageDescription.match(/frames=(\d+)/)
          return {
              slices: slicesMatch ? parseInt(slicesMatch[1], 10) : 1,
              frames: framesMatch ? parseInt(framesMatch[1], 10) : 1
          }
        }
        const imageDescription = image?.meta?.tiff?.tags?.ImageDescription
        const { slices, frames } = extractSlicesAndFrames(imageDescription)
        const hdr = new nifti.NIFTI1()
        hdr.littleEndian = true
        hdr.dims = [3, 1, 1, 1, 0, 0, 0, 0]
        hdr.dims[1] = image.width
        hdr.dims[2] = image.height
        hdr.dims[3] = n3x4
        if ((slices * frames === n3x4) && (frames > 1)) {
          // 4d dataset
          hdr.dims[0] = 4
          hdr.dims[3] = slices
          hdr.dims[4] = frames
        }
        // set pixDims
        hdr.pixDims = [1, 1, 1, 1, 1, 0, 0, 0]
        let chan = image.channels
        //set datatype
        if ((image.bitDepth === 16) && (image.channels === 1)) {
          hdr.numBitsPerVoxel = 16
          if ((Number.isFinite(maxValue)) && (maxValue < 32768))
            hdr.datatypeCode = 4 //DT_INT16
          else
            hdr.datatypeCode = 512 // DT_UINT16
        } else if ((image.bitDepth === 8) && (image.channels === 1)) {
          hdr.numBitsPerVoxel = 8
          hdr.datatypeCode = 2 // DT_UINT8
        } else if ((image.bitDepth === 8) && (image.channels === 3)) {
          hdr.numBitsPerVoxel = 24
          hdr.datatypeCode = 128 // DT_RGB
        }  else if ((image.bitDepth === 8) && (image.channels === 4)) {
          // n.b. getPixelsArray() discards alpha
          //hdr.numBitsPerVoxel = 24
          //hdr.datatypeCode = 128 // DT_RGB
          image.channels = 3
          hdr.numBitsPerVoxel = 32
          hdr.datatypeCode = 2304 // DT_RGBA32
        } else {
          throw new Error(`Unsupported datatype bitDepth: ${image.bitDepth} channels:  ${image.channels}`)
        }
        if (verbose) {
          console.log(`${hdr.dims[1]}×${hdr.dims[2]}×${hdr.dims[3]}×${hdr.dims[4]} bit-depth ${image.bitDepth} channels ${image.channels}`)
        }
        const nvox = hdr.dims[1] * hdr.dims[2] * n3x4
        // Determine the correct TypedArray based on bit depth
        let imgArray
        if (hdr.datatypeCode === 4) { // DT_INT16
            imgArray = new Int16Array(nvox)
        } else if (hdr.datatypeCode === 512) { // DT_UINT16
            imgArray = new Uint16Array(nvox)
        } else {
            imgArray = new Uint8Array(nvox * chan)
        }
        // Copy each TIFF slice into the unified array
        for (let i = 0; i < n3x4; i++) {
            if (verbose) console.log('slice', i)
            const rawData = images[i].getPixelsArray() // Get raw pixel data
            const sliceData = new Uint8Array(rawData.flat()) // Flatten nested
            const offset = i * image.width * image.height // Compute correct slice offset
            if (sliceData.length !== image.width * image.height * chan) {
                throw new Error(`Unexpected pixel count in slice ${i}: expected ${image.width * image.height * chan}, got ${sliceData.length}`)
            }
            imgArray.set(sliceData, offset) // Copy slice data to correct position
        }
        const img8 = new Uint8Array(imgArray.buffer)
        hdr.vox_offset = 352
        hdr.scl_inter = 0
        hdr.scl_slope = 1 // todo: check
        hdr.magic = 'n+1'
        const hdrBytes = hdrToArrayBufferX({ ...hdr, vox_offset: 352 })
        const opad = new Uint8Array(4)
        const odata = new Uint8Array(hdrBytes.length + opad.length + img8.length)
        odata.set(hdrBytes)
        odata.set(opad, hdrBytes.length)
        odata.set(img8, hdrBytes.length + opad.length)
        return odata
    } catch (error) {
        console.error("Error reading TIFF file:", error.message)
    }
}