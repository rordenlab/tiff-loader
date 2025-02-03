# tiff-loader

The tiff-loader is a NiiVue plugin that converts TIFF bitmap images into NIfTI voxel-based images. It uses the [geotiff](https://github.com/geotiffjs/geotiff.js) library parse TIFF files for visualization or analysis.

The Tagged Image File Format became popular in miscroscopy for its ability to include high precision (16-bit depth) and custom tags to report scanning important parameters. For example, Leica LSM (Laser Scanning Microscope) images are based on the TIFF format, but they contain additional metadata and custom extensions specific to Leica confocal microscopy. The popular ImageJ inserts proprietary information (e.g. using `frames` and `slices` to define 4D datasets). The Open Microscopy Environment [OME-TIFF](https://ome-model.readthedocs.io/en/stable/ome-tiff/) specifies useful custom tags. Since different tools specify different tags, [ImageJ provides multiple different TIFF loaders](https://imagej.net/formats/tiff).

The Tagged Image File Format [(TIFF)](https://paulbourke.net/dataformats/tiff/) has become widely used in microscopy due to its support for high-precision imaging (e.g., 16-bit depth) and custom metadata tags that capture essential scanning parameters.

A challenge is that a single TIFF file can contain 2D images of different size and bit-depth. In contrast, NIfTI requires that all slices in a file have identical dimensions. Using [ImageJ terminology](https://imagej.net/ij/docs/guide/146-8.html#toc-Section-8) we refer to all the 2D slices that share dimensions as a `stack`, and a TIFF file that has multiple stacks as a `hyperstack`. For example, Zeiss Laser Scanning Microscopes often create TIFF images (with the .LSM extension) that include images in both full resolution as well as reduced resolution thumbnails (illustrated in the ImageJ sample datasets). To handle this, the included `loader.js` includes two functions: `tiff2nii()` always returns the first stack in a TIFF image. In contrast, `tiff2niiStack()` returns one stack (by default the first) and listing of all the stacks in an image. Through successive calls to `tiff2niiStack()`, one can sequentially convert all the stacks in a hyperstack to separate NIfTI images. The `tiff2nii` demo program illustrates this.

Various tools extend the TIFF format with their own metadata:

- Zeiss LSM (Laser Scanning Microscope) images are based on TIFF but incorporate custom with a proprietary tag with image details. These files also contain thumbnails. This library is able to interpret the custom tag and extract thumbnails.
- OME-TIFF (Open Microscopy Environment) introduces standardized tags to improve compatibility across imaging platforms.
  Since different software tools define their own TIFF metadata conventions, compatibility can vary, making specialized loaders necessary for correct interpretation.
- ImageJ, a popular image analysis tool, embeds proprietary metadata (e.g., using frames and slices to define 4D datasets). ImageJ provides [multiple](https://imagej.net/formats/tiff) TIFF loaders to handle different tag variations (ImageJ, OME, LSM).

Since different software tools define their own TIFF metadata conventions, compatibility can vary, making specialized loaders necessary for correct interpretation. The goal of this NiiVue loader is to automatically detect and handle these variations.

## Local Development

To illustrate this library, `tiff2nii` is a node.js converter that can be run from the command line. The wrapper `batch_convert.js` allows you to convert all the tiff/tif/lsm files in a folder:

```
git clone git@github.com:rordenlab/tiff-loader.git
cd tiff-loader
npm install
node ./src/tiff2nii.js ./tests/testData/shapes_deflate.tif
node ./src/batch_convert.js /path/to/tiffs
```

Note that Python equivalents (`tiff2nii.py` uses [imio](https://github.com/brainglobe/imio); `tiff2nii2.py` uses tifffile and nibabel). However, the Python converters are unaware of the tags used by ImageJ, LSM and OME. Therefore, these fail to correctly detect and order images based on slice, timing and channels, nor do they provide information about the [physical size](https://brainder.org/2012/09/23/the-nifti-file-format/).

## Local Browser Development

You can also embed this loader into a hot-reloadable NiiVue web page to evaluate integration:

```
git clone git@github.com:rordenlab/tiff-loader.git
cd tiff-loader
npm install
npm run dev
```

## Sample datasets

While TIFF is a popular 2D image format for bitmaps, it is also used by scientific instruments for multi-frame datasets with high precision (e.g. 16-bit scalars).

- [ImageJ samples](https://samples.fiji.sc/) including ImageJ TIFF and LSM (Leica variation of TIFF).
- [OME-TIFF sample data](https://ome-model.readthedocs.io/en/stable/ome-tiff/data.html).
- [Example TIFF images illustrating edge cases such as rare compression schemes](https://github.com/tlnagy/exampletiffs).

## Alternative libraries

For scientific applications, we need to preserve the precision of the source data (retaining 8, 16 or 32 bits per channel) and read 4D datasets (with 3D slices and different timepoints or contrasts). This limits the number of suitable libraries. This repository uses geotiff for speed and compatibility.

- [geotiff](https://github.com/geotiffjs/geotiff.js) is a JavaScript library for reading TIFF images. Requires 600ms for convert a 16-bit 240x295x41x17 TIF.
- [image-js](https://github.com/image-js/image-js) is a JavaScript library for reading TIFF images. It does not support PackBits compression. Requires 2166ms for convert a 16-bit 240x295x41x17 TIF.
