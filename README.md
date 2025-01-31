# tiff-loader

The tiff-loader is a NiiVue plugin that converts TIFF bitmap images into NIfTI voxel-based images. 

The Tagged Image File Format became popular in miscroscopy for its ability to include high precision (16-bit depth) and custom tags to report scanning important parameters. For example, Leica LSM (Laser Scanning Microscope) images are based on the TIFF format, but they contain additional metadata and custom extensions specific to Leica confocal microscopy. The popular ImageJ inserts proprietary information (e.g. using `frames` and `slices` to define 4D datasets). The Open Microscopy Environment [OME-TIFF](https://ome-model.readthedocs.io/en/stable/ome-tiff/) specifies useful custom tags. Since different tools specify different tags, [ImageJ provides multiple different TIFF loaders](https://imagej.net/formats/tiff).

The Tagged Image File Format [(TIFF)](https://paulbourke.net/dataformats/tiff/) has become widely used in microscopy due to its support for high-precision imaging (e.g., 16-bit depth) and custom metadata tags that capture essential scanning parameters.

Various microscopy tools extend the TIFF format with their own metadata conventions:

 - Leica LSM (Laser Scanning Microscope) images are based on TIFF but incorporate custom metadata and extensions specific to Leica confocal microscopy.
 - OME-TIFF (Open Microscopy Environment) introduces standardized tags to improve compatibility across imaging platforms.
Since different software tools define their own TIFF metadata conventions, compatibility can vary, making specialized loaders necessary for correct interpretation.
  - ImageJ, a popular image analysis tool, embeds proprietary metadata (e.g., using frames and slices to define 4D datasets). ImageJ provides [multiple](https://imagej.net/formats/tiff) TIFF loaders to handle different tag variations (ImageJ, OME, LSM).

Since different software tools define their own TIFF metadata conventions, compatibility can vary, making specialized loaders necessary for correct interpretation. The goal of this NiiVue loader is to automatically detect and handle these variations.

## Local Development

This converter can be run from the command line using node.js:

```
git clone git@github.com:rordenlab/tiff-loader.git
cd tiff-loader
npm install
node ./src/tiff2nii.js ./tests/testData/shapes_deflate.tif 
```

## Sample datasets

While TIFF is a popular 2D image format for bitmaps, it is also used by scientific instruments for multi-frame datasets with high precision (e.g. 16-bit scalars).

 - [ImageJ samples](https://samples.fiji.sc/) including ImageJ TIFF and LSM (Leica variation of TIFF).
 - [OME-TIFF sample data](https://docs.openmicroscopy.org/ome-model/5.6.3/ome-tiff/data.html).
 - [Example TIFF images illustrating edge cases such as rare compression schemes](https://github.com/tlnagy/exampletiffs).

## Links

For scientific applications, we need to preserve the precision of the source data (retaining 8, 16 or 32 bits per channel) and read 4D datasets (with 3D slices and different timepoints or contrasts). This limits the number of suitable libraries.

 - [geotiff](https://github.com/geotiffjs/geotiff.js) is a JavaScript library for reading TIFF images.
 - [image-js](https://github.com/image-js/image-js) is a JavaScript library for reading TIFF images. It does not support PackBits compression. Requires 2166ms for convert a 16-bit 240x295x41x17 TIF.

