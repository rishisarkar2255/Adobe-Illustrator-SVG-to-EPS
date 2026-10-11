/*
Adobe Illustrator SVG -> EPS 10 Complete Automation Workflow
FIXED & COMPLETE VERSION - Handles all requirements including:
  ✓ Artboard creation & verification
  ✓ Complete white background removal
  ✓ Raster image background handling
  ✓ Text frame removal
  ✓ Group creation & centering
  ✓ Artboard alignment verification
  ✓ EPS export with proper settings

USAGE
1. Open Illustrator.
2. File > Scripts > Other Script...
3. Select this JSX file.
4. Select input folder with SVG files.
5. Select output folder for EPS files.
6. Review the detailed report.
*/

#target illustrator

(function () {
    // ARTBOARD SPECIFICATIONS
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

    // ====== UTILITY FUNCTIONS ======

    function getBounds(item) {
        try {
            var vb = item.visibleBounds;
            if (vb && vb[0] !== Infinity) return vb;
        } catch (e) {}
        try {
            var gb = item.geometricBounds;
            if (gb && gb[0] !== Infinity) return gb;
        } catch (e2) {}
        return null;
    }

    function widthOf(b) { return b ? Math.abs(b[2] - b[0]) : 0; }
    function heightOf(b) { return b ? Math.abs(b[1] - b[3]) : 0; }

    function isInfinityBounds(b) {
        return !b || b[0] === Infinity || b[2] === -Infinity;
    }

    function unionBounds(items) {
        var u = null;
        for (var i = 0; i < items.length; i++) {
            var b = getBounds(items[i]);
            if (!b || isInfinityBounds(b)) continue;
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

    // ====== COLOR DETECTION ======

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

    // ====== BACKGROUND DETECTION & REMOVAL ======

    function isLikelyWhiteBackground(path, contentBounds) {
        if (!path || path.typename !== "PathItem" || !contentBounds) return false;
        try {
            if (!path.filled || path.stroked || !path.closed) return false;
            if (path.pathPoints.length > 12 || !isWhite(path.fillColor)) return false;

            var b = getBounds(path);
            if (!b || isInfinityBounds(b)) return false;

            var cw = widthOf(contentBounds);
            var ch = heightOf(contentBounds);
            var pw = widthOf(b);
            var ph = heightOf(b);

            if (cw <= 0 || ch <= 0 || pw <= 0 || ph <= 0) return false;

            // White rectangle covers or substantially surrounds content
            var tolX = cw * 0.05;
            var tolY = ch * 0.05;
            var coversContent = b[0] <= contentBounds[0] + tolX &&
                                b[1] >= contentBounds[1] - tolY &&
                                b[2] >= contentBounds[2] - tolX &&
                                b[3] <= contentBounds[3] + tolY;
            var substantiallyLarger = pw >= cw * 0.85 && ph >= ch * 0.85;

            return coversContent && substantiallyLarger;
        } catch (e) {
            return false;
        }
    }

    function getNonWhiteVectorBounds(doc) {
        var items = [];
        try {
            for (var i = 0; i < doc.pathItems.length; i++) {
                var p = doc.pathItems[i];
                try {
                    if (p.hidden || p.guides || p.clipping) continue;
                    // Exclude pure white paths to avoid background defining bounds
                    if (p.filled && isWhite(p.fillColor) && !p.stroked) continue;
                    items.push(p);
                } catch (e) {}
            }
        } catch (e) {}
        return unionBounds(items);
    }

    function isImageItem(item) {
        try {
            return item.typename === "PlacedItem" || item.typename === "RasterItem";
        } catch (e) {
            return false;
        }
    }

    function getVectorBounds(doc) {
        var paths = [];
        try {
            for (var i = 0; i < doc.pathItems.length; i++) {
                var p = doc.pathItems[i];
                try {
                    if (!p.hidden && !p.guides && !p.clipping) paths.push(p);
                } catch (e) {}
            }
        } catch (e) {}
        return unionBounds(paths);
    }

    function isLikelyFullBackgroundImage(item, vectorBounds) {
        if (!item || !isImageItem(item) || !vectorBounds) return false;
        try {
            if (item.hidden || item.locked) return false;
            var b = getBounds(item);
            if (!b || isInfinityBounds(b)) return false;

            var vw = widthOf(vectorBounds);
            var vh = heightOf(vectorBounds);
            var iw = widthOf(b);
            var ih = heightOf(b);

            if (vw <= 0 || vh <= 0 || iw <= 0 || ih <= 0) return false;

            // Calculate overlap
            var overlapLeft = Math.max(b[0], vectorBounds[0]);
            var overlapTop = Math.min(b[1], vectorBounds[1]);
            var overlapRight = Math.min(b[2], vectorBounds[2]);
            var overlapBottom = Math.max(b[3], vectorBounds[3]);
            var overlapW = Math.max(0, overlapRight - overlapLeft);
            var overlapH = Math.max(0, overlapTop - overlapBottom);
            var vectorCoverage = (overlapW * overlapH) / (vw * vh);

            var containsVector = b[0] <= vectorBounds[0] + vw * 0.03 &&
                                 b[1] >= vectorBounds[1] - vh * 0.03 &&
                                 b[2] >= vectorBounds[2] - vw * 0.03 &&
                                 b[3] <= vectorBounds[3] + vh * 0.03;

            return containsVector && vectorCoverage >= 0.95 &&
                   iw >= vw * 0.95 && ih >= vh * 0.95;
        } catch (e) {
            return false;
        }
    }

    function removeFullBackgroundImages(doc, vectorBounds) {
        var removed = 0;
        try {
            for (var i = doc.pageItems.length - 1; i >= 0; i--) {
                var item = doc.pageItems[i];
                if (isLikelyFullBackgroundImage(item, vectorBounds)) {
                    try {
                        item.remove();
                        removed++;
                    } catch (e) {}
                }
            }
        } catch (e) {}
        return removed;
    }

    // ====== LAYER & GROUP OPERATIONS ======

    function getTopLevelItems(doc) {
        var items = [];
        try {
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
        } catch (e) {}
        return items;
    }

    function removeLiveText(doc) {
        var removed = 0;
        try {
            for (var i = doc.textFrames.length - 1; i >= 0; i--) {
                try {
                    doc.textFrames[i].remove();
                    removed++;
                } catch (e) {}
            }
        } catch (e) {}
        return removed;
    }

    function chooseUnlockedLayer(doc) {
        try {
            for (var i = 0; i < doc.layers.length; i++) {
                if (doc.layers[i].visible && !doc.layers[i].locked) {
                    return doc.layers[i];
                }
            }
        } catch (e) {}
        return null;
    }

    // ====== ARTBOARD OPERATIONS ======

    function resetAndVerifyArtboard(doc) {
        try {
            if (!doc.artboards || doc.artboards.length < 1) {
                doc.artboards.add(ART_RECT);
            }
            doc.artboards[0].artboardRect = ART_RECT;

            var actual = doc.artboards[0].artboardRect;
            for (var i = 0; i < 4; i++) {
                if (Math.abs(actual[i] - ART_RECT[i]) > 0.5) {
                    throw new Error("Artboard verification failed. Expected: " + 
                        ART_RECT.join(", ") + " | Actual: " + actual.join(", "));
                }
            }
            return true;
        } catch (err) {
            throw err;
        }
    }

    function centerGroupOnArtboard(group, doc) {
        try {
            if (!group || !doc.artboards || doc.artboards.length < 1) {
                throw new Error("Cannot center: invalid group or missing artboard.");
            }

            var gb = getBounds(group);
            if (!gb || isInfinityBounds(gb)) {
                throw new Error("Cannot measure group bounds for centering.");
            }

            var artRect = doc.artboards[0].artboardRect;
            var centerX = artRect[0] + (artRect[2] - artRect[0]) / 2;
            var centerY = artRect[1] - (artRect[1] - artRect[3]) / 2;
            var groupWidth = widthOf(gb);
            var groupHeight = heightOf(gb);

            if (groupWidth <= 0 || groupHeight <= 0) {
                throw new Error("Invalid group dimensions: " + groupWidth + " x " + groupHeight);
            }

            // Position group center at artboard center
            group.position = [
                centerX - groupWidth / 2,
                centerY + groupHeight / 2
            ];

            return true;
        } catch (err) {
            throw err;
        }
    }

    // ====== MAIN PROCESSING FUNCTION ======

    function processFile(svgFile, outputFolder) {
        var doc = null;
        var report = {
            ok: false,
            filename: svgFile.name,
            output: null,
            error: null,
            steps: {}
        };

        try {
            // STEP 1: OPEN & SETUP ARTBOARD
            doc = app.open(svgFile);
            if (!doc) throw new Error("Failed to open SVG file.");

            report.steps.artboardSetup = "Setting up artboard...";
            resetAndVerifyArtboard(doc);
            report.steps.artboardSetup = "✓ Artboard created and verified: " + ART_RECT.join(", ");

            // STEP 2: REMOVE LIVE TEXT
            report.steps.textRemoval = "Removing live text frames...";
            var textRemoved = removeLiveText(doc);
            report.steps.textRemoval = "✓ Removed " + textRemoved + " text frame(s)";

            // STEP 3: GET CONTENT BOUNDS (excluding white background)
            report.steps.boundsCalculation = "Calculating content bounds...";
            var contentBounds = getNonWhiteVectorBounds(doc);
            report.steps.boundsCalculation = "✓ Content bounds calculated";

            // STEP 4: REMOVE SIMPLE WHITE BACKGROUND PATHS
            report.steps.whitePathRemoval = "Removing white background paths...";
            var bgRemoved = 0;
            if (contentBounds && !isInfinityBounds(contentBounds)) {
                for (var i = doc.pathItems.length - 1; i >= 0; i--) {
                    var path = doc.pathItems[i];
                    if (isLikelyWhiteBackground(path, contentBounds)) {
                        try {
                            path.remove();
                            bgRemoved++;
                        } catch (e) {}
                    }
                }
            }
            report.steps.whitePathRemoval = "✓ Removed " + bgRemoved + " white background path(s)";

            // STEP 5: REMOVE FULL-BACKGROUND RASTER/PLACED IMAGES
            report.steps.imageBackgroundRemoval = "Checking for background images...";
            var vectorBounds = getNonWhiteVectorBounds(doc);
            var imageBackgroundsRemoved = 0;
            if (vectorBounds && !isInfinityBounds(vectorBounds)) {
                imageBackgroundsRemoved = removeFullBackgroundImages(doc, vectorBounds);
            }
            report.steps.imageBackgroundRemoval = "✓ Removed " + imageBackgroundsRemoved + 
                " background image(s)";

            // STEP 6: VERIFY REMAINING ARTWORK
            report.steps.artworkVerification = "Verifying remaining artwork...";
            var items = getTopLevelItems(doc);
            if (!items || items.length === 0) {
                throw new Error("No artwork remains after cleanup. Check if design is entirely white or a single raster image.");
            }
            report.steps.artworkVerification = "✓ Found " + items.length + " top-level item(s)";

            // STEP 7: GROUP ARTWORK
            report.steps.grouping = "Grouping artwork...";
            var layer = chooseUnlockedLayer(doc);
            if (!layer) throw new Error("No visible, unlocked layer available.");

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
                throw new Error("Grouping failed: Main Design group is empty.");
            }
            report.steps.grouping = "✓ Grouped " + moved + "/" + items.length + " items";

            // STEP 8: CENTER GROUP ON ARTBOARD
            report.steps.alignment = "Centering design on artboard...";
            centerGroupOnArtboard(group, doc);
            report.steps.alignment = "✓ Design centered on artboard";

            // STEP 9: FINAL ARTBOARD VERIFICATION
            report.steps.finalArtboardCheck = "Final artboard verification...";
            resetAndVerifyArtboard(doc);
            report.steps.finalArtboardCheck = "✓ Artboard verified";

            // STEP 10: SAVE AS EPS
            report.steps.epsSave = "Saving as EPS...";
            var baseName = svgFile.name.replace(/\.[^\.]+$/, "");
            var outputFile = new File(outputFolder.fsName + "/" + baseName + ".eps");
            var suffix = 1;

            while (outputFile.exists) {
                outputFile = new File(outputFolder.fsName + "/" + baseName + 
                    "_converted_" + suffix + ".eps");
                suffix++;
            }

            var epsOptions = new EPSSaveOptions();
            epsOptions.compatibility = Compatibility.ILLUSTRATOR10;
            epsOptions.embedAllFonts = true;
            epsOptions.embedLinkedFiles = true;
            epsOptions.includeDocumentThumbnails = true;

            doc.saveAs(outputFile, epsOptions);

            if (!outputFile.exists || outputFile.length <= 0) {
                throw new Error("EPS save verification failed: file missing or empty.");
            }

            report.steps.epsSave = "✓ Saved: " + outputFile.fsName;
            report.ok = true;
            report.output = outputFile.fsName;

            return report;

        } catch (err) {
            report.error = err.toString();
            report.ok = false;
            return report;

        } finally {
            if (doc !== null) {
                try {
                    doc.close(SaveOptions.DONOTSAVECHANGES);
                } catch (closeErr) {}
            }
        }
    }

    // ====== MAIN WORKFLOW ======

    var inputFolder = Folder.selectDialog("Select folder containing SVG files");
    if (!inputFolder) {
        alert("Cancelled: no input folder selected.");
        return;
    }

    var outputFolder = Folder.selectDialog("Select folder for EPS output");
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

    alert("Processing " + svgFiles.length + " SVG file(s)...\n\nInput: " + 
        inputFolder.fsName + "\nOutput: " + outputFolder.fsName);

    var results = [];
    var successCount = 0;

    for (var f = 0; f < svgFiles.length; f++) {
        var result = processFile(svgFiles[f], outputFolder);
        results.push(result);
        if (result.ok) successCount++;
    }

    // ====== GENERATE REPORT ======

    var reportText = "SVG to Illustrator 10 EPS Automation - Complete Report\n";
    reportText += "=========================================================\n\n";
    reportText += "Input folder: " + inputFolder.fsName + "\n";
    reportText += "Output folder: " + outputFolder.fsName + "\n";
    reportText += "Total files: " + svgFiles.length + "\n";
    reportText += "Successful: " + successCount + "\n";
    reportText += "Failed: " + (svgFiles.length - successCount) + "\n\n";

    reportText += "ARTBOARD SPECIFICATION:\n";
    reportText += "  Position: (" + ART_LEFT + ", " + ART_TOP + ")\n";
    reportText += "  Size: " + ART_WIDTH + " x " + ART_HEIGHT + " pt\n";
    reportText += "  Rect: " + ART_RECT.join(", ") + "\n\n";

    for (var r = 0; r < results.length; r++) {
        var res = results[r];
        reportText += "--- " + (r + 1) + ". " + res.filename + " ---\n";

        if (res.ok) {
            reportText += "Status: ✓ SUCCESS\n";
            reportText += "Output: " + res.output + "\n";
            for (var key in res.steps) {
                reportText += "  " + res.steps[key] + "\n";
            }
        } else {
            reportText += "Status: ✗ FAILED\n";
            reportText += "Error: " + res.error + "\n";
        }
        reportText += "\n";
    }

    alert(reportText);

    // Save report to file
    var reportFile = new File(outputFolder.fsName + "/SVG_to_EPS_Report_" + 
        new Date().getTime() + ".txt");
    reportFile.encoding = "UTF-8";
    reportFile.open("w");
    reportFile.write(reportText);
    reportFile.close();

})();
