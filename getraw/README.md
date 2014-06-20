# osmium-getraw

This program scans a specified osm file (e.g. in .pbf format) and output a json file to stdout with the counts of combinations of POIs (ways and nodes) by their tags and names, and a list of their coordinates.

The generated output should be named topNames.json, for further processing by build.js to build a suggestion index with country code information.

A modern compiler and standard C++ library supporting C++11 is needed. It could be compiled under GCC 4.8.2.

## Prerequisites

The following library is directly used

    Osmium (libosmium)
        http://osmcode.org/libosmium
        A fast and flexible C++ library for working with OpenStreetMap data.
        Debian/Ubuntu: libosmium-dev 

The following libraries are required by osmium.  Please see the README file of libosmium for building instructions.  Some of them may not be needed for building this program.

    boost (several libraries)
    boost-program-options (for parsing command line options)
    zlib (for PBF and gzip support)
    bz2lib (for bzip2 support)
    GDAL (for OGR support)
    Expat (for parsing XML files)
    GEOS (for assembling multipolygons etc.)
    Google sparsehash
    Google protocol buffers (for PBF support)
    Doxygen (to build API documentation)
    libboost-test (for tests)
    OSMPBF (for PBF support)

## Usage

    Usage: ./osmium-getraw OSMFILE [Threshold] > topNames.json



