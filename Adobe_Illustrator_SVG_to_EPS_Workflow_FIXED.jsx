#target illustrator

(function () {
    var ART_LEFT = 3500;
    var ART_TOP = -2000;
    var ART_WIDTH = 7000;
    var ART_HEIGHT = 4000;
    var ART_RECT = [ART_LEFT, ART_TOP, ART_LEFT + ART_WIDTH, ART_TOP - ART_HEIGHT];

    function getBounds(item) {
        try { return item.visibleBounds; } catch (e) {}
        try { return item.geometricBounds; } catch (e2) {}
        return null;
    }

    function widthOf(b) { return b ? Math.abs(b[2] - b[0]) : 0; }
    function heightOf(b) { return b ? Math.abs(b[1] - b[3]) : 0; }

    function isWhiteColor(color) {
        if (!color) return false;
        try {
            if (color.typename === "RGBColor") {
                return color.red >= 250 && color.green >= 250 && color.blue >= 250;
            }
            if (color.typename === "GrayColor") {
                return color.gray >= 95;
            }
            if (color.typename === "CMYKColor") {
                return color.cyan <= 2 && color.magenta <= 2 && color.yellow <= 2 && color.black <= 2;
            }
        } catch (e) {}
        return false;
    }

    function removeAllWhiteElements(doc) {
        var removed = 0;

        // সব white fill paths এবং shapes remove করো
        for (var i = doc.pathItems.length - 1; i >= 0; i--) {
            try {
                var path = doc.pathItems[i];
                if (path.filled && isWhiteColor(path.fillColor) && !path.stroked) {
                    path.remove();
                    removed++;
                }
            } catch (e) {}
        }

        // সব text remove করো
        for (var j = doc.textFrames.length - 1; j >= 0; j--) {
            try {
                doc.textFrames[j].remove();
                removed++;
            } catch (e) {}
        }

        // সব compound paths check করো
        for (var k = doc.compoundPathItems.length - 1; k >= 0; k--) {
            try {
                var cp = doc.compoundPathItems[k];
                if (cp.filled && isWhiteColor(cp.fillColor) && !cp.stroked) {
                    cp.remove();
                    removed++;
                }
            } catch (e) {}
        }

        return removed;
    }

    function setArtboardRect(doc) {
        try {
            if (!doc.artboards || doc.artboards.length === 0) {
                doc.artboards.add(ART_RECT);
            }
            doc.artboards[0].artboardRect = ART_RECT;
            return true;
        } catch (e) {
            return false;
        }
    }

    function centerArtwork(doc) {
        try {
            var allItems = [];
            for (var i = 0; i < doc.layers.length; i++) {
                var layer = doc.layers[i];
                if (layer.visible && !layer.locked) {
                    for (var j = 0; j < layer.pageItems.length; j++) {
                        allItems.push(layer.pageItems[j]);
                    }
                }
            }

            if (allItems.length === 0) return false;

            var bounds = null;
            for (var k = 0; k < allItems.length; k++) {
                var b = getBounds(allItems[k]);
                if (b) {
                    if (!bounds) {
                        bounds = [b[0], b[1], b[2], b[3]];
                    } else {
                        bounds[0] = Math.min(bounds[0], b[0]);
                        bounds[1] = Math.max(bounds[1], b[1]);
                        bounds[2] = Math.max(bounds[2], b[2]);
                        bounds[3] = Math.min(bounds[3], b[3]);
                    }
                }
            }

            if (!bounds) return false;

            var centerX = ART_LEFT + ART_WIDTH / 2;
            var centerY = ART_TOP - ART_HEIGHT / 2;
            var offsetX = centerX - (bounds[0] + bounds[2]) / 2;
            var offsetY = centerY - (bounds[1] + bounds[3]) / 2;

            for (var m = 0; m < allItems.length; m++) {
                try {
                    allItems[m].translate(offsetX, offsetY);
                } catch (e) {}
            }

            return true;
        } catch (e) {
            return false;
        }
    }

    function savePNG(doc, outputPath) {
        try {
            var pngOptions = new ExportOptionsPNG24();
            pngOptions.antiAliasing = true;
            pngOptions.transparency = true;
            pngOptions.interlaced = false;

            var file = new File(outputPath);
            doc.exportFile(file, ExportType.PNG24, pngOptions);
            return true;
        } catch (e) {
            return false;
        }
    }

    function processFile(svgFile, outputFolder) {
        var doc = null;
        try {
            doc = app.open(svgFile);

            // Step 1: Artboard set করো
            if (!setArtboardRect(doc)) {
                throw new Error("Could not set artboard");
            }

            // Step 2: সব white elements remove করো
            var whiteRemoved = removeAllWhiteElements(doc);

            // Step 3: Remaining artwork center করো
            centerArtwork(doc);

            // Step 4: Final artboard verify করো
            setArtboardRect(doc);

            // Step 5: PNG export করো
            var baseName = svgFile.name.replace(/\.[^\.]+$/, "");
            var outputPath = outputFolder.fsName + "/" + baseName + ".png";
            var suffix = 1;

            while (new File(outputPath).exists) {
                outputPath = outputFolder.fsName + "/" + baseName + "_" + suffix + ".png";
                suffix++;
            }

            if (!savePNG(doc, outputPath)) {
                throw new Error("PNG export failed");
            }

            var outputFile = new File(outputPath);
            if (!outputFile.exists || outputFile.length <= 0) {
                throw new Error("Output PNG is empty or missing");
            }

            return {
                ok: true,
                output: outputPath,
                whiteElementsRemoved: whiteRemoved
            };
        } catch (err) {
            return { ok: false, error: err.toString() };
        } finally {
            if (doc !== null) {
                try {
                    doc.close(SaveOptions.DONOTSAVECHANGES);
                } catch (e) {}
            }
        }
    }

    // UI
    var inputFolder = Folder.selectDialog("SVG files এর folder select করো");
    if (!inputFolder) {
        alert("Cancelled");
        return;
    }

    var outputFolder = Folder.selectDialog("PNG output folder select করো");
    if (!outputFolder) {
        alert("Cancelled");
        return;
    }

    var svgFiles = inputFolder.getFiles(function (f) {
        return f instanceof File && /\.svg$/i.test(f.name);
    });

    if (!svgFiles || svgFiles.length === 0) {
        alert("কোনো SVG file পাওয়া যায়নি");
        return;
    }

    var successes = 0;
    var errors = [];
    var log = [];

    for (var f = 0; f < svgFiles.length; f++) {
        var result = processFile(svgFiles[f], outputFolder);
        if (result.ok) {
            successes++;
            log.push("✓ " + svgFiles[f].name + " → PNG (white removed: " + result.whiteElementsRemoved + ")");
        } else {
            errors.push("✗ " + svgFiles[f].name + " — " + result.error);
        }
    }

    var message = "PNG Conversion Complete!\n\n" +
        "Total: " + svgFiles.length + "\n" +
        "Success: " + successes + "\n" +
        "Failed: " + errors.length + "\n\n" +
        "Output: " + outputFolder.fsName + "\n\n";

    if (log.length) message += log.join("\n");
    if (errors.length) message += "\n\nErrors:\n" + errors.join("\n");

    alert(message);
})();
