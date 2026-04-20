// shapes.js -- shape generators + geometry helpers

(function () {
    var G = window.G;

    function roundedRect(w, h, r) {
        var pts = [];
        var hw = w / 2, hh = h / 2;
        r = Math.min(r, hw, hh);
        var segsPerCorner = 6;
        var corners = [
            [hw - r, -hh + r, -Math.PI / 2],
            [hw - r,  hh - r,  0],
            [-hw + r, hh - r,  Math.PI / 2],
            [-hw + r, -hh + r, Math.PI],
        ];
        for (var ci = 0; ci < corners.length; ci++) {
            var cx = corners[ci][0], cy = corners[ci][1], a0 = corners[ci][2];
            for (var i = 0; i < segsPerCorner; i++) {
                var a = a0 + (i / segsPerCorner) * (Math.PI / 2);
                pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
            }
        }
        return pts;
    }

    function disc(radius, n) {
        if (n === undefined) n = 14;
        var pts = [];
        for (var i = 0; i < n; i++) {
            var a = (i / n) * Math.PI * 2;
            pts.push([Math.cos(a) * radius, Math.sin(a) * radius]);
        }
        return pts;
    }

    function sharkShape(s) {
        return [
            [16 * s,  0],
            [-8 * s, -10 * s],
            [-3 * s,  0],
            [-8 * s,  10 * s],
        ];
    }

    function transformVerts(pts, x, y, rot) {
        var c = Math.cos(rot), s = Math.sin(rot);
        var out = [];
        for (var i = 0; i < pts.length; i++) {
            var px = pts[i][0], py = pts[i][1];
            out.push([x + px * c - py * s, y + px * s + py * c]);
        }
        return out;
    }

    function toSegments(pts) {
        if (pts.length < 2) return [];
        var segs = [];
        for (var i = 0; i < pts.length; i++) {
            segs.push([pts[i], pts[(i + 1) % pts.length]]);
        }
        return segs;
    }

    function rayVsSeg(ox, oy, dx, dy, x1, y1, x2, y2) {
        var sx = x2 - x1, sy = y2 - y1;
        var denom = dx * sy - dy * sx;
        if (Math.abs(denom) < 1e-10) return Infinity;
        var vx = x1 - ox, vy = y1 - oy;
        var t = (vx * sy - vy * sx) / denom;
        var u = (vx * dy - vy * dx) / denom;
        return (t > 0.5 && u >= 0 && u <= 1) ? t : Infinity;
    }

    function normalizeAngle(a) {
        if (!isFinite(a)) return 0;
        a = a % (Math.PI * 2);
        if (a > Math.PI) a -= Math.PI * 2;
        if (a < -Math.PI) a += Math.PI * 2;
        return a;
    }

    // Signed distance from a point to an axis-aligned rounded rectangle
    // centered at the origin. Half-extents (hw, hh), corner radius r.
    // Negative inside, zero on edge, positive outside.
    function sdRoundedRect(px, py, hw, hh, r) {
        var ax = Math.abs(px) - (hw - r);
        var ay = Math.abs(py) - (hh - r);
        var qx = Math.max(ax, 0);
        var qy = Math.max(ay, 0);
        var outside = Math.sqrt(qx * qx + qy * qy);
        var inside = Math.min(Math.max(ax, ay), 0);
        return outside + inside - r;
    }

    // Ray-casting point-in-polygon for a closed polygon in vertex order.
    function pointInPolygon(px, py, poly) {
        var inside = false;
        for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            var xi = poly[i][0], yi = poly[i][1];
            var xj = poly[j][0], yj = poly[j][1];
            if (((yi > py) !== (yj > py)) &&
                (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }
        return inside;
    }

    G.shapes = {
        roundedRect: roundedRect,
        disc: disc,
        sharkShape: sharkShape,
        transformVerts: transformVerts,
        toSegments: toSegments,
        rayVsSeg: rayVsSeg,
        normalizeAngle: normalizeAngle,
        sdRoundedRect: sdRoundedRect,
        pointInPolygon: pointInPolygon,
    };
})();
