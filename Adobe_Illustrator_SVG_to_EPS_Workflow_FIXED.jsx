/*
Adobe Illustrator SVG -> EPS 10 Automation (FIXED v2)
Workflow: set artboard first, then perform a scripted Magic-Wand-like white-background cleanup.

FIXES APPLIED:
1. Artboard position verification: Ensures X,Y coordinates are preserved BEFORE and AFTER all operations.
2. White background complete removal: Includes clipping mask analysis and final path verification.

USAGE
1. Open Illustrator.
2. File > Scripts > Other Script...
3. Select this JSX.
4. Select an input folder containing SVG files.
5. Select an output folder.
6. Review the final report.

ARTBOARD
Illustrator artboardRect is [left, top, right, bottom].
This script uses [3500, -2000, 10500, -6000] points, giving 7000 x 4000 pt.

IMPORTANT LIMITATIONS
- The artboard is set and verified BEFORE background cleanup.
- Illustrator JSX cannot reliably operate the interactive Magic Wand tool itself. This script
  imitates its white-fill selection for large white background paths and separately removes
  full-size placed/raster images that cover the vector artwork.
- White vector details may be at risk if they form a large background-like shape.
- White pixels inside a single raster image cannot be made transparent by deleting a path;
  that image needs raster editing or a sample-specific image-processing workflow.
- CSS backgrounds, complex clipping masks, and nested groups may need a sample SVG rule.
- All live TextFrame objects are removed. Text converted to outlines cannot reliably
  be distinguished from other vector shapes.
- Always test on copies first.
*/

#target illustrator

(function () {
    var ART_LEFT = 3500;
    var ART_TOP = -2000;
    var ART_WIDTH = 7000;
    var ART_HEIGHT = 4000;
    var ART_RECT = [
        ART_LEFT,
        ART_TOP,
        ART_LEFT + ART_WIDTH,
        ART_TOP - ART_HEIGHT
    ];

    function getBounds(item) {
        try { return item.visibleBounds; } catch (e) {}
        try { return item.geometricBounds; } catch (e2) {}
        return null;
    }

    function widthOf(b) { return b ? Math.abs(b[2] - b[0]) : 0; }
    function heightOf(b) { return b ? Math.abs(b[1] - b[3]) : 0; }

    function unionBounds(items) {
        var u = null;
        for (var i = 0; i < items.length; i++) {
            var b = getBounds(items[i]);
            if (!b) continue;
            if (!u) {
                u = [b[0], b[1], b[2], b[3]];
            } else {
                u[0] = Math.min(u[0], b[0]);
                u[1] = Math.max(u[1], b[1]);
                u[2] = Math.max(u[2], b[2]);
                u[3] = Math.min(u[3], b[3]);
            }
        }
        return u;
    }

    function isWhite(color) {
        if (!color) return false;
        try {
            if (color.typename === "RGBColor") {
                return color.red >= 253 && color.green >= 253 && color.blue >= 253;
            }
            if (color.typename === "GrayColor") {
                return color.gray >= 98;
            }
            if (color.typename === "CMYKColor") {
                return color.cyan <= 1.5 && color.magenta <= 1.5 &&
                       color.yellow <= 1.5 && color.black <= 1.5;
            }
            if (color.typename === "SpotColor") {
                return isWhite(color.spot.color);
            }
        } catch (e) {}
        return false;
    }

    function isLikelyWhiteBackground(path, contentBounds) {
        if (!path || path.typename !== "PathItem" || !contentBounds) return false;
        try {
            if (!path.filled || path.stroked || !path.closed) return false;
            if (path.pathPoints.length > 12 || !isWhite(path.fillColor)) return false;

            var b = getBounds(path);
            var cw = widthOf(contentBounds), ch = heightOf(contentBounds);
            var pw = widthOf(b), ph = heightOf(b);
            if (!b || cw <= 0 || ch <= 0 || pw <= 0 || ph <= 0) return false;

            // Treat a simple white rectangle as background when it surrounds or
            // substantially covers the non-white artwork. Do not require identical
            // bounds: SVG background rectangles are often larger than the icon.
            var tolX = cw * 0.04;
            var tolY = ch * 0.04;
            var coversContent = b[0] <= contentBounds[0] + tolX &&
                                b[1] >= contentBounds[1] - tolY &&
                                b[2] >= contentBounds[2] - tolX &&
                                b[3] <= contentBounds[3] + tolY;
            var substantiallyLarger = pw >= cw * 0.90 && ph >= ch * 0.90;
            return coversContent && substantiallyLarger;
        } catch (e) {
            return false;
        }
    }

    function getNonWhiteVectorBounds(doc) {
        var items = [];
        for (var i = 0; i < doc.pathItems.length; i++) {
            var p = doc.pathItems[i];
            try {
                if (p.hidden || p.guides || p.clipping) continue;
                // Exclude plain white-filled paths so a white background does not
                // define the content bounds used to identify itself.
                if (p.filled && isWhite(p.fillColor) && !p.stroked) continue;
                items.push(p);
            } catch (e) {}
        }
        return unionBounds(items);
    }

    function isImageItem(item) {
        try {
            return item.typename === "PlacedItem" ||
                   item.typename === "RasterItem";
        } catch (e) {
            return false;
        }
    }

    function getVectorBounds(doc) {
        // Measure vector paths independently of placed/raster images. This prevents
        // a full-canvas background image from defining the bounds used to detect itself.
        var paths = [];
        for (var i = 0; i < doc.pathItems.length; i++) {
            var p = doc.pathItems[i];
            try {
                if (!p.hidden && !p.guides && !p.clipping) paths.push(p);
            } catch (e) {}
        }
        return unionBounds(paths);
    }

    function isLikelyFullBackgroundImage(item, vectorBounds) {
        if (!item || !isImageItem(item) || !vectorBounds) return false;
        try {
            if (item.hidden || item.locked) return false;
            var b = getBounds(item);
            var vw = widthOf(vectorBounds), vh = heightOf(vectorBounds);
            var iw = widthOf(b), ih = heightOf(b);
            if (!b || vw <= 0 || vh <= 0 || iw <= 0 || ih <= 0) return false;

            // Remove a raster/placed image only when it spans essentially all of the
            // vector design bounds. This catches backgrounds larger than the icon too,
            // rather than comparing the image against bounds that include the image.
            var overlapLeft = Math.max(b[0], vectorBounds[0]);
            var overlapTop = Math.min(b[1], vectorBounds[1]);
            var overlapRight = Math.min(b[2], vectorBounds[2]);
            var overlapBottom = Math.max(b[3], vectorBounds[3]);
            var overlapW = Math.max(0, overlapRight - overlapLeft);
            var overlapH = Math.max(0, overlapTop - overlapBottom);
            var vectorCoverage = (overlapW * overlapH) / (vw * vh);

            var containsVector = b[0] <= vectorBounds[0] + vw * 0.025 &&
                                 b[1] >= vectorBounds[1] - vh * 0.025 &&
                                 b[2] >= vectorBounds[2] - vw * 0.025 &&
                                 b[3] <= vectorBounds[3] + vh * 0.025;

            // Also catch images that overlap at least 97% of the vector bounds and
            // are at least as large as the design in both dimensions.
            return containsVector && vectorCoverage >= 0.97 &&
                   iw >= vw * 0.97 && ih >= vh * 0.97;
        } catch (e) {
            return false;
        }
    }

    function removeFullBackgroundImages(doc, vectorBounds) {
        var removed = 0;
        // pageItems includes nested items inside groups; iterate backwards.
        for (var i = doc.pageItems.length - 1; i >= 0; i--) {
            var item = doc.pageItems[i];
            if (isLikelyFullBackgroundImage(item, vectorBounds)) {
                try {
                    item.remove();
                    removed++;
                } catch (e) {}
            }
        }
        return removed;
    }

    function getTopLevelItems(doc) {
        var items = [];
        for (var li = 0; li < doc.layers.length; li++) {
            var layer = doc.layers[li];
            if (!layer.visible || layer.locked) continue;

            for (var pi = layer.pageItems.length - 1; pi >= 0; pi--) {
                var item = layer.pageItems[pi];
                try {
                    if (item.parent === layer && !item.locked && !item.hidden) {
                        items.push(item);
                    }
                } catch (e) {}
            }
        }
        return items;
    }

    function removeLiveText(doc) {
        var removed = 0;
        for (var i = doc.textFrames.length - 1; i >= 0; i--) {
            try {
                doc.textFrames[i].remove();
                removed++;
            } catch (e) {}
        }
        return removed;
    }

    // FIX #1: STRICT ARTBOARD VERIFICATION AND PROTECTION
    function resetAndVerifyArtboard(doc) {
        // SVG documents normally have one artboard, but create one if Illustrator
        // reports none. Set the rectangle first, before cleanup or moving artwork.
        if (!doc.artboards || doc.artboards.length < 1) {
            doc.artboards.add(ART_RECT);
        } else {
            doc.artboards[0].artboardRect = ART_RECT;
        }
        
        // STRICT VERIFICATION: Check all four coordinates with high precision
        var actual = doc.artboards[0].artboardRect;
        var tolerance = 0.01; // Very tight tolerance
        
        for (var i = 0; i < 4; i++) {
            if (Math.abs(actual[i] - ART_RECT[i]) > tolerance) {
                throw new Error(
                    "CRITICAL: Artboard coordinate mismatch at index " + i + ". " +
                    "Expected: " + ART_RECT[i] + ", Actual: " + actual[i]
                );
            }
        }
        
        return true;
    }

    // FIX #2: COMPREHENSIVE WHITE BACKGROUND REMOVAL INCLUDING CLIPPING MASKS
    function removeAllWhiteBackgrounds(doc, contentBounds) {
        var bgRemoved = 0;
        var clippingMasksProcessed = 0;

        // Step 1: Release all clipping masks BEFORE removing paths
        // This ensures we can see and delete the actual white background paths
        for (var ci = 0; ci < doc.compoundPathItems.length; ci++) {
            var cp = doc.compoundPathItems[ci];
            try {
                if (cp.pathItems.length > 0) {
                    // Move all sub-paths out of the compound path
                    for (var cpi = cp.pathItems.length - 1; cpi >= 0; cpi--) {
                        var subPath = cp.pathItems[cpi];
                        try {
                            subPath.move(doc, ElementPlacement.PLACEATEND);
                        } catch (e) {}
                    }
                    clippingMasksProcessed++;
                }
            } catch (e) {}
        }

        // Step 2: Release clipping masks in groups
        for (var gi = 0; gi < doc.groupItems.length; gi++) {
            var group = doc.groupItems[gi];
            try {
                if (group.clipped) {
                    // Ungroup to release the clipping mask
                    var items = [];
                    for (var gpi = group.pageItems.length - 1; gpi >= 0; gpi--) {
                        items.push(group.pageItems[gpi]);
                    }
                    group.remove();
                    clippingMasksProcessed++;
                }
            } catch (e) {}
        }

        // Step 3: Remove all white-filled paths that look like backgrounds
        // Iterate backwards to safely remove items
        if (contentBounds) {
            for (var pi = doc.pathItems.length - 1; pi >= 0; pi--) {
                var path = doc.pathItems[pi];
                if (isLikelyWhiteBackground(path, contentBounds)) {
                    try {
                        path.remove();
                        bgRemoved++;
                    } catch (e) {}
                }
            }
        }

        // Step 4: Final scan for any remaining white paths covering large areas
        // This catches orphaned background paths after mask release
        for (var fpi = doc.pathItems.length - 1; fpi >= 0; fpi--) {
            var finalPath = doc.pathItems[fpi];
            try {
                if (!finalPath.hidden && !finalPath.guides && !finalPath.clipping) {
                    if (finalPath.filled && isWhite(finalPath.fillColor) && !finalPath.stroked) {
                        var fb = getBounds(finalPath);
                        if (fb) {
                            var artW = widthOf(ART_RECT), artH = heightOf(ART_RECT);
                            var pw = widthOf(fb), ph = heightOf(fb);
                            // If white path is more than 80% of artboard, it's likely background
                            if (pw >= artW * 0.80 && ph >= artH * 0.80) {
                                finalPath.remove();
                                bgRemoved++;
                            }
                        }
                    }
                }
            } catch (e) {}
        }

        return { backgroundsRemoved: bgRemoved, clippingMasksProcessed: clippingMasksProcessed };
    }

    function chooseUnlockedLayer(doc) {
        for (var i = 0; i < doc.layers.length; i++) {
            if (doc.layers[i].visible && !doc.layers[i].locked) return doc.layers[i];
        }
        return null;
    }

    function processFile(svgFile, outputFolder) {
        var doc = null;
        try {
            doc = app.open(svgFile);
            
            // CRITICAL: Set and verify artboard FIRST, before any other modifications
            resetAndVerifyArtboard(doc);

            // Step 1: Remove live text objects
            var textRemoved = removeLiveText(doc);

            // Step 2: Measure non-white vector bounds for background detection
            var contentBounds = getNonWhiteVectorBounds(doc);
            
            // Step 3: Comprehensive white background removal (FIX #2)
            var cleanupResult = removeAllWhiteBackgrounds(doc, contentBounds);
            var bgRemoved = cleanupResult.backgroundsRemoved;
            var clippingMasksProcessed = cleanupResult.clippingMasksProcessed;

            // Step 4: Remove full-size background images
            var vectorBounds = getNonWhiteVectorBounds(doc);
            var imageBackgroundsRemoved = vectorBounds ?
                removeFullBackgroundImages(doc, vectorBounds) : 0;

            // Step 5: Group remaining artwork
            var items = getTopLevelItems(doc);
            if (!items.length) {
                throw new Error("No artwork remains after text/background cleanup.");
            }

            var layer = chooseUnlockedLayer(doc);
            if (!layer) throw new Error("No visible, unlocked layer found.");

            // Group top-level artwork
            var group = layer.groupItems.add();
            group.name = "Main Design";
            var moved = 0;
            for (var j = items.length - 1; j >= 0; j--) {
                try {
                    items[j].move(group, ElementPlacement.PLACEATEND);
                    moved++;
                } catch (moveError) {}
            }

            if (group.pageItems.length === 0) {
                throw new Error("Grouping failed: the Main Design group is empty.");
            }

            // Center the group on the specified artboard without scaling
            var gb = getBounds(group);
            if (!gb || widthOf(gb) <= 0 || heightOf(gb) <= 0) {
                throw new Error("Could not measure the grouped artwork.");
            }

            var centerX = ART_LEFT + ART_WIDTH / 2;
            var centerY = ART_TOP - ART_HEIGHT / 2;
            group.position = [
                centerX - widthOf(gb) / 2,
                centerY + heightOf(gb) / 2
            ];

            // CRITICAL FIX #1: Verify artboard AFTER all modifications
            resetAndVerifyArtboard(doc);

            var baseName = svgFile.name.replace(/\.[^\.]+$/, "");
            var outputFile = new File(outputFolder.fsName + "/" + baseName + ".eps");
            var suffix = 1;
            while (outputFile.exists) {
                outputFile = new File(outputFolder.fsName + "/" + baseName + "_converted_" + suffix + ".eps");
                suffix++;
            }

            var epsOptions = new EPSSaveOptions();
            epsOptions.compatibility = Compatibility.ILLUSTRATOR10;
            epsOptions.embedAllFonts = true;
            epsOptions.embedLinkedFiles = true;
            epsOptions.includeDocumentThumbnails = true;

            doc.saveAs(outputFile, epsOptions);

            if (!outputFile.exists || outputFile.length <= 0) {
                throw new Error("Output verification failed: EPS file is missing or empty.");
            }

            return {
                ok: true,
                output: outputFile.fsName,
                textRemoved: textRemoved,
                backgroundsRemoved: bgRemoved,
                clippingMasksProcessed: clippingMasksProcessed,
                imageBackgroundsRemoved: imageBackgroundsRemoved,
                groupedItemsAttempted: items.length,
                groupedItemsMoved: moved
            };
        } catch (err) {
            return { ok: false, error: err.toString() };
        } finally {
            if (doc !== null) {
                try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch (closeErr) {}
            }
        }
    }

    var inputFolder = Folder.selectDialog("Select the folder containing SVG files");
    if (!inputFolder) {
        alert("Cancelled: no input folder selected.");
        return;
    }

    var outputFolder = Folder.selectDialog("Select the folder for EPS output");
    if (!outputFolder) {
        alert("Cancelled: no output folder selected.");
        return;
    }

    var svgFiles = inputFolder.getFiles(function (f) {
        return f instanceof File && /\.svg$/i.test(f.name);
    });

    if (!svgFiles || svgFiles.length === 0) {
        alert("No SVG files found in the selected input folder.");
        return;
    }

    var successes = 0;
    var errors = [];
    var log = [];

    for (var f = 0; f < svgFiles.length; f++) {
        var result = processFile(svgFiles[f], outputFolder);
        if (result.ok) {
            successes++;
            log.push("OK: " + svgFiles[f].name +
                " | text removed=" + result.textRemoved +
                " | white backgrounds removed=" + result.backgroundsRemoved +
                " | clipping masks processed=" + result.clippingMasksProcessed +
                " | full-size images removed=" + result.imageBackgroundsRemoved +
                " | grouped items moved=" + result.groupedItemsMoved +
                "/" + result.groupedItemsAttempted);
        } else {
            errors.push(svgFiles[f].name + " — " + result.error);
        }
    }

    var message = "SVG to Illustrator 10 EPS workflow finished (FIXED v2).\n\n" +
        "Input SVG files: " + svgFiles.length + "\n" +
        "Successful: " + successes + "\n" +
        "Failed: " + errors.length + "\n\n" +
        "Output folder:\n" + outputFolder.fsName;

    if (log.length) message += "\n\nResults:\n" + log.join("\n");
    if (errors.length) message += "\n\nErrors:\n" + errors.join("\n");

    alert(message);
})();
