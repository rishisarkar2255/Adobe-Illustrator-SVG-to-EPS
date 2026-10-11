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

            return containsVector && vectorCoverage >= 0.97 &&
                   iw >= vw * 0.97 && ih >= vh * 0.97;
        } catch (e) {
            return false;
        }
    }

    function removeFullBackgroundImages(doc, vectorBounds) {
        var removed = 0;
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

    function resetAndVerifyArtboard(doc) {
        if (!doc.artboards || doc.artboards.length < 1) {
            doc.artboards.add(ART_RECT);
        } else {
            doc.artboards[0].artboardRect = ART_RECT;
        }

        var actual = doc.artboards[0].artboardRect;
        for (var i = 0; i < 4; i++) {
            if (Math.abs(actual[i] - ART_RECT[i]) > 0.1) {
                throw new Error("Artboard position/size verification failed. Actual: " + actual.join(", "));
            }
        }
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
            resetAndVerifyArtboard(doc);

            var textRemoved = removeLiveText(doc);

            var contentBounds = getNonWhiteVectorBounds(doc);
            var allItemsBeforeCleanup = getTopLevelItems(doc);
            var fallbackBounds = unionBounds(allItemsBeforeCleanup);

            var bgRemoved = 0;
            if (contentBounds) {
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

            var vectorBounds = getNonWhiteVectorBounds(doc);
            var imageBackgroundsRemoved = vectorBounds ?
                removeFullBackgroundImages(doc, vectorBounds) : 0;

            var items = getTopLevelItems(doc);
            if (!items.length) {
                throw new Error("No artwork remains after text/background cleanup.");
            }

            var layer = chooseUnlockedLayer(doc);
            if (!layer) throw new Error("No visible, unlocked layer found.");

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
                " | large white background paths removed=" + result.backgroundsRemoved +
                " | full-size placed/raster images removed=" + result.imageBackgroundsRemoved +
                " | grouped items moved=" + result.groupedItemsMoved +
                "/" + result.groupedItemsAttempted);
        } else {
            errors.push(svgFiles[f].name + " — " + result.error);
        }
    }

    var message = "SVG to Illustrator 10 EPS workflow finished.\n\n" +
        "Input SVG files: " + svgFiles.length + "\n" +
        "Successful: " + successes + "\n" +
        "Failed: " + errors.length + "\n\n" +
        "Output folder:\n" + outputFolder.fsName;

    if (log.length) message += "\n\nResults:\n" + log.join("\n");
    if (errors.length) message += "\n\nErrors:\n" + errors.join("\n");

    alert(message);
})();
