// Generators Module for Babylon.js Dungeon Crawler (Dungeon & Level Gen)
window.DungeonCrawler = Object.assign(window.DungeonCrawler || {}, {
    generateDungeon: function (w, h) {
        const grid = Array(h).fill().map(() => Array(w).fill(1)), rooms = [];
        const roomCount = 25;
        for (let i = 0; i < roomCount; i++) {
            const isBoss = (i === roomCount - 1);
            const rw = isBoss ? 9 : Math.floor(Math.random() * 5) + 5;
            const rh = isBoss ? 9 : Math.floor(Math.random() * 5) + 5;
            const rx = Math.floor(Math.random() * (w - rw - 2)) + 1, ry = Math.floor(Math.random() * (h - rh - 2)) + 1;
            if (!rooms.some(r => rx < r.x + r.w && rx + rw > r.x && ry < r.y + r.h && ry + rh > r.y)) { for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) grid[y][x] = 0; rooms.push({ x: rx, y: ry, w: rw, h: rh }); }
        }
        for (let i = 0; i < rooms.length - 1; i++) {
            let x1 = Math.floor(rooms[i].x + rooms[i].w/2), y1 = Math.floor(rooms[i].y + rooms[i].h/2), x2 = Math.floor(rooms[i+1].x + rooms[i+1].w/2), y2 = Math.floor(rooms[i+1].y + rooms[i+1].h/2);
            for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) { grid[y1][x] = 0; if (y1+1 < grid.length) grid[y1+1][x] = 0; }
            for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) { grid[y][x2] = 0; if (x2+1 < grid[0].length) grid[y][x2+1] = 0; }
        }
        return { grid, rooms, bossRoom: rooms[rooms.length-1] };
    },

    renderDungeon: function (g, s, br) {
        const fMat = new BABYLON.StandardMaterial("f", this.scene); fMat.diffuseColor = new BABYLON.Color3(0.2, 0.2, 0.25);
        const wMat = new BABYLON.StandardMaterial("w", this.scene); wMat.diffuseColor = new BABYLON.Color3(0.4, 0.4, 0.45); wMat.bumpTexture = new BABYLON.Texture("https://www.babylonjs-playground.com/textures/rockn.png", this.scene);
        const bWMat = new BABYLON.StandardMaterial("bw", this.scene); bWMat.diffuseColor = new BABYLON.Color3(0.1, 0.05, 0.05); bWMat.specularColor = new BABYLON.Color3(0.4, 0, 0);
        const bFMat = new BABYLON.StandardMaterial("bf", this.scene); bFMat.diffuseColor = new BABYLON.Color3(0.05, 0.05, 0.08);

        let floors = [], walls = [], bFloors = [], bWalls = [];
        for (let y = 0; y < g.length; y++) {
            for (let x = 0; x < g[0].length; x++) {
                const p = new BABYLON.Vector3(x * this.gridSize, 0, y * this.gridSize);
                const isBR = br && x >= br.x && x < br.x + br.w && y >= br.y && y < br.y + br.h;
                if (g[y][x] === 0) {
                    const f = BABYLON.MeshBuilder.CreatePlane("f", { size: this.gridSize }, this.scene);
                    f.rotation.x = Math.PI / 2; f.position = p; (isBR ? bFloors : floors).push(f);
                } else {
                    const w = BABYLON.MeshBuilder.CreateBox("w", { size: this.gridSize, height: 2.5 }, this.scene);
                    w.position = p.add(new BABYLON.Vector3(0, 1.25, 0)); (isBR ? bWalls : walls).push(w);
                }
            }
        }

        const merge = (list, mat, shad, collisions) => {
            if (list.length > 0) {
                const m = BABYLON.Mesh.MergeMeshes(list, true, true, undefined, false, true);
                m.material = mat; if(shad) shad.addShadowCaster(m); m.checkCollisions = collisions;
                if(mat === fMat || mat === bFMat) m.receiveShadows = true; return m;
            }
        };

        merge(floors, fMat, null, true); merge(walls, wMat, s, true);
        merge(bFloors, bFMat, null, true); merge(bWalls, bWMat, s, true);
    }
});
