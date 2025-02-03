#!/usr/bin/env node

import fs from 'fs/promises'
import path from 'path'
import { convertTiffToNifti } from './tiff2nii.js' // Now properly imported

const inputDir = process.argv[2]

if (!inputDir) {
  console.error('Usage: node batch_convert.js <input_directory>')
  process.exit(1)
}

/**
 * Get all TIFF/LSM files from a directory.
 */
async function getTiffFiles(dir) {
  try {
    const files = await fs.readdir(dir)
    return files.filter((file) => file.match(/\.(tiff|tif|lsm)$/i)).map((file) => path.join(dir, file))
  } catch (error) {
    console.error(`Error reading directory: ${error.message}`)
    process.exit(1)
  }
}

/**
 * Convert all TIFF/LSM files sequentially.
 */
async function convertFilesSequentially(files) {
  for (const filePath of files) {
    try {
      await convertTiffToNifti(filePath, true) // Now correctly called
    } catch (error) {
      console.error(` Error processing ${filePath}: ${error.message}`)
    }
  }
  console.log('Batch conversion complete.')
}

;(async () => {
  const tiffFiles = await getTiffFiles(inputDir)

  if (tiffFiles.length === 0) {
    console.error(' No TIFF or LSM files found in the directory.')
    process.exit(1)
  }

  console.log(` Found ${tiffFiles.length} TIFF/LSM files. Starting conversion...`)
  await convertFilesSequentially(tiffFiles)
})()
