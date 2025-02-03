#!/usr/bin/env node
import { tiff2niiStack } from './lib/loader.js'
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
  const isVerbose = true
  let { niftiImage, stackConfigs } = await tiff2niiStack(fileBuffer, isVerbose, 0)
  const elapsedTime = performance.now() - startTime
  // Get base filename without extension
  const baseName = path.join(path.dirname(filePath), path.basename(filePath, path.extname(filePath)))
  if (stackConfigs.length < 2) {
    const outputFilePath = `${baseName}.nii`
    await fs.writeFile(outputFilePath, Buffer.from(niftiImage))
    console.log(`Converted to ${outputFilePath} in ${elapsedTime.toFixed(2)} ms`)
  } else {
    // Handle multiple stacks by saving each stack with an appended name
    for (let i = 0; i < stackConfigs.length; i++) {
      if (i > 0) {
        ;({ niftiImage } = await tiff2niiStack(fileBuffer, isVerbose, i))
      }
      const outputFilePath = `${baseName}_${stackConfigs[i]}.nii`
      await fs.writeFile(outputFilePath, Buffer.from(niftiImage))
      console.log(`Converted to ${outputFilePath} in ${elapsedTime.toFixed(2)} ms`)
    }
  }
} catch (error) {
  console.error(`Error: ${error.message}`)
  process.exit(1)
}
