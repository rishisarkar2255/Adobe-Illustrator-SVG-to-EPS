#target illustrator

(function () {
    var svgInput = new File("/path/to/input.svg");
    var outputFolder = new Folder("/path/to/output");
    var pngOutput = new File(outputFolder.fsName + "/design_transparent.png");
    var epsOutput = new File(outputFolder.fsName + "/design_illustrator10.eps");

    if (!svgInput.exists) {
        alert("SVG input file not found:\n" + svgInput.fsName);
        return;
    }

    if (!outputFolder.exists) {
        outputFolder.create();
    }

    var doc = app.documents.add();
    doc.viewPreferences.rulerUnits = RulerUnits.points;
    doc.usingLegacyFileCompatibility = false;

    // 1) Create/fix the artboard to required exact settings
    createOrFixArtboard(doc, 3500, -2000, 7000, 4000);

    // 2) Import SVG
    placeSvg(doc, svgInput);

    // 3) Remove white background object(s)
    removeWhiteBackground(doc);

    // 4) Remove text objects
    removeTextObjects(doc);

    // 5) Group the design
    var mainGroup = groupMainDesign(doc);

    // 6) Align group to artboard center
    centerGroupOnArtboard(doc, mainGroup);

    // 7) Optional transparent PNG export
    //     Uncomment if you need PNG output
    // exportPNG(doc, pngOutput);

    // 8) Save EPS as Illustrator 10
    saveIllustrator10EPS(doc, epsOutput);

    alert("Workflow complete.\n\nEPS saved to:\n" + epsOutput.fsName);
})();

function createOrFixArtboard(doc, x, y, width, height) {
    // Illustrator artboardRect uses [left, top, right, bottom]
    var left = x;
    var top = y;
    var right = x + width;
    var bottom = y - height;

    if (doc.artboards.length === 0) {
        doc.artboards.add();
    }

    var artboard = doc.artboards[0];
    artboard.artboardRect = [left, top, right, bottom];

    // Preserve exact artboard position and dimensions by reapplying after import
    // If locking is available in your Illustrator version, lock it here:
    // artboard.locked = true;

    // Make sure the first artboard is active
    doc.artboards.setActiveArtboardIndex(0);
}

function placeSvg(doc, svgFile) {
    var placed = doc.placedItems.add();
    placed.file = svgFile;

    // Place at default position; then we will align and clean afterwards
    // Many SVGs have their own internal dimensions.
    // If the SVG arrives as a linked item, the script still works on the content.
    // If needed, change the file import method here.
}

function removeWhiteBackground(doc) {
    var items = doc.pageItems;
    var toRemove = [];

    for (var i = 0; i < items.length; i++) {
        var item = items[i];

        // Skip invisible/locked items
        if (!item.visible) continue;

        // Ignore clipping masks etc. only when they are clearly part of design
        if (item.typename === "TextFrame") continue;

        // Detect large white background shapes:
        // - large white rectangle/path
        // - near-white fill
        // - occupies a large area of artboard
        var fillColor = getFillColor(item);
        var strokeColor = getStrokeColor(item);
        var area = getItemArea(item);

        var isLargeWhiteShape = false;

        if (fillColor && isNearWhite(fillColor) && !hasNonWhiteArtwork(item)) {
            if (area > 0.15 * getArtboardArea(doc)) {
                isLargeWhiteShape = true;
            }
        }

        // Also detect plain white rectangles/photos
        if (item.typename === "Rectangle" || item.typename === "PathItem") {
            if (isNearWhite(fillColor) && area > 0.12 * getArtboardArea(doc)) {
                isLargeWhiteShape = true;
            }
        }

        if (isLargeWhiteShape) {
            toRemove.push(item);
        }
    }

    // Remove in reverse order to avoid collection issues
    for (var j = toRemove.length - 1; j >= 0; j--) {
        try {
            toRemove[j].remove();
        } catch (e) {
            // ignore if a piece is already gone
        }
    }
}

function removeTextObjects(doc) {
    var textItems = [];
    for (var i = 0; i < doc.textFrames.length; i++) {
        textItems.push(doc.textFrames[i]);
    }

    for (var j = 0; j < doc.pageItems.length; j++) {
        var item = doc.pageItems[j];
        if (item.typename === "TextFrame") {
            textItems.push(item);
        }
    }

    for (var k = 0; k < textItems.length; k++) {
        try {
            textItems[k].remove();
        } catch (e) {
            // ignore
        }
    }

    // Some text may be converted to outlines/paths.
    // We can also remove white/near-white object paths that are very small and text-like.
    // This is heuristic, not perfect on all SVGs.
    var items = doc.pageItems;
    for (var i = items.length - 1; i >= 0; i--) {
        var item = items[i];
        if (!item.visible) continue;

        if (item.typename === "PathItem" || item.typename === "CompoundPathItem") {
            var fill = getFillColor(item);
            if (fill && isNearWhite(fill)) {
                var bounds = item.visibleBounds;
                var w = Math.abs(bounds[2] - bounds[0]);
                var h = Math.abs(bounds[1] - bounds[3]);
                if (w < 50 && h < 50) {
                    // likely decorative text/letter fragments
                    try {
                        item.remove();
                    } catch (e) {}
                }
            }
        }
    }
}

function groupMainDesign(doc) {
    var selected = [];
    var items = doc.pageItems;

    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (!item.visible) continue;
        if (item.locked) continue;

        // Skip background-like things and pure text
        if (item.typename === "TextFrame") continue;

        var fill = getFillColor(item);
        if (fill && isNearWhite(fill)) {
            var area = getItemArea(item);
            var artArea = getArtboardArea(doc);
            if (area > 0.12 * artArea) continue; // likely background
        }

        selected.push(item);
    }

    if (selected.length === 0) {
        alert("No design items were detected to group.");
        return null;
    }

    // Deselect everything
    doc.selection = null;

    // Select the likely design items
    doc.selection = selected;

    // Create group
    var group = doc.groupItems.add();
    group.name = "MainDesign";

    // Move selected items into group
    for (var j = selected.length - 1; j >= 0; j--) {
        try {
            selected[j].move(group, ElementPlacement.INSIDE);
        } catch (e) {}
    }

    // Ensure group is selected
    doc.selection = null;
    group.selected = true;
    return group;
}

function centerGroupOnArtboard(doc, group) {
    if (!group) return;

    var artboard = doc.artboards[0];
    var rect = artboard.artboardRect;

    var left = rect[0];
    var top = rect[1];
    var right = rect[2];
    var bottom = rect[3];
    var cx = (left + right) / 2;
    var cy = (top + bottom) / 2;

    doc.selection = null;
    group.selected = true;

    // Align group to artboard center
    try {
        group.align(AlignType.HORIZONTALCENTERS, AlignTo.ARTBOARD);
        group.align(AlignType.VERTICALCENTERS, AlignTo.ARTBOARD);
    } catch (e) {
        // Fallback: position by bounds
        var bounds = group.visibleBounds;
        var groupW = Math.abs(bounds[2] - bounds[0]);
        var groupH = Math.abs(bounds[1] - bounds[3]);

        var newX = cx - (groupW / 2);
        var newY = cy + (groupH / 2);
        group.position = [newX, newY];
    }

    // Final verification by re-centering
    var finalBounds = group.visibleBounds;
    var finalW = Math.abs(finalBounds[2] - finalBounds[0]);
    var finalH = Math.abs(finalBounds[1] - finalBounds[3]);

    // If group drifted, center it again
    group.position = [cx - (finalW / 2), cy + (finalH / 2)];
}

function saveIllustrator10EPS(doc, epsFile) {
    var options = new EPSSaveOptions();
    options.cmykPostScript = false;
    options.embedLinkedFiles = false;
    options.saveMultipleArtboards = false;
    options.compatibility = Compatibility.ILLUSTRATOR10;

    doc.saveAs(epsFile, options);
}

function exportPNG(doc, pngFile) {
    var options = new ExportOptionsPNG24();
    options.artBoardClipping = true;
    options.transparent = true;
    options.antiAliasing = true;
    options.transparency = true;

    doc.exportFile(pngFile, ExportType.PNG24, options);
}

function getArtboardArea(doc) {
    var artboard = doc.artboards[0].artboardRect;
    var w = Math.abs(artboard[2] - artboard[0]);
    var h = Math.abs(artboard[1] - artboard[3]);
    return w * h;
}

function getItemArea(item) {
    try {
        var bounds = item.visibleBounds;
        var w = Math.abs(bounds[2] - bounds[0]);
        var h = Math.abs(bounds[1] - bounds[3]);
        return w * h;
    } catch (e) {
        return 0;
    }
}

function getFillColor(item) {
    try {
        if (item.filled && item.fillColor) {
            return item.fillColor;
        }
    } catch (e) {}
    return null;
}

function getStrokeColor(item) {
    try {
        if (item.stroked && item.strokeColor) {
            return item.strokeColor;
        }
    } catch (e) {}
    return null;
}

function hasNonWhiteArtwork(item) {
    try {
        var fill = item.fillColor;
        if (fill && !isNearWhite(fill)) return true;

        var stroke = item.strokeColor;
        if (stroke && !isNearWhite(stroke)) return true;
    } catch (e) {}

    return false;
}

function isNearWhite(color) {
    // Accept RGB/CMYK color objects from Illustrator
    var r = 0, g = 0, b = 0;
    try {
        if (color instanceof RGBColor) {
            r = color.red; g = color.green; b = color.blue;
        } else if (color instanceof CMYKColor) {
            r = (1 - color.cyan) * 255;
            g = (1 - color.magenta) * 255;
            b = (1 - color.yellow) * 255;
        }
    } catch (e) {
        return false;
    }

    var threshold = 245;
    return (r > threshold && g > threshold && b > threshold);
}
