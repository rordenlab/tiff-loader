#!/usr/bin/env node
import { tiff2nii } from './lib/loader.js'
import * as fs from 'fs/promises'
import path from 'path'
import { performance } from 'perf_hooks'

// Ensure a file path is provided
if (process.argv.length < 3) {
  console.error('Usage: node read_tiff.js <path-to-tiff>')
  process.exit(1)
}

const filePath = process.argv[2]
try {
  await fs.access(filePath)
  const fileBuffer = await fs.readFile(filePath)
  const startTime = performance.now()
  const niidata = await tiff2nii(fileBuffer, true)
  const elapsedTime = performance.now() - startTime
  const outputFilePath = filePath.replace(/\.(lsm|tiff|tif)$/i, '.nii')
  await fs.writeFile(outputFilePath, Buffer.from(niidata))
  console.log(`Converted to ${outputFilePath} in ${elapsedTime.toFixed(2)} ms`)
} catch (error) {
  console.error(`Error: ${error.message}`)
  process.exit(1)
}
